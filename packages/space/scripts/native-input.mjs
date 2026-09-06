import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const path = require.resolve('@deepseek-ai/dsh-client-ui-conversation/client')
const source = await readFile(path, 'utf8')
const hash = 'fe448ef7e0b1f3e7713dadfc7eff56b9f80d103a2111dfe69c1735ffd0196d61'
if (createHash('sha256').update(source).digest('hex') !== hash)
  throw new Error('原生输入包校验失败，请先审查 DSH 兼容契约，不能跳过校验')

// 按符号依赖提取原生纯输入状态机，不执行或改写宿主 bundle
const options = { allowJs: true, noLib: true, target: ts.ScriptTarget.ESNext }
const program = ts.createProgram([path], options)
const file = program.getSourceFile(path)
const checker = program.getTypeChecker()
const registration = file.statements[0]?.expression?.arguments?.[0]
const factory = registration?.properties.find(p => p.name?.text === 'factory')?.initializer
if (!factory || !ts.isArrowFunction(factory) || !ts.isBlock(factory.body))
  throw new Error('原生模块结构不匹配')
const body = factory.body
function top(node) {
  while (node && node.parent !== body)
    node = node.parent
  return node
}
const selected = new Set()
function collect(node) {
  if (ts.isIdentifier(node)) {
    for (const declaration of checker.getSymbolAtLocation(node)?.declarations ?? []) {
      const statement = top(declaration)
      if (statement && !selected.has(statement)) {
        if (!ts.isVariableStatement(statement) && !ts.isFunctionDeclaration(statement))
          throw new Error('原生输入依赖出现非声明副作用')
        selected.add(statement)
        collect(statement)
      }
    }
  }
  ts.forEachChild(node, collect)
}
for (const name of ['SessionInputShell', 'ConversationRoot']) {
  const declaration = body.statements.find(s => ts.isVariableStatement(s)
    ? s.declarationList.declarations.some(d => d.name.getText(file) === name)
    : ts.isFunctionDeclaration(s) && s.name?.text === name)
  if (!declaration)
    throw new Error(`缺少原生 ${name}`)
  selected.add(declaration)
  collect(declaration)
}
const f = ts.factory
let context
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'chipTitle') {
    return f.updateVariableDeclaration(node, node.name, node.exclamationToken, node.type, f.createBinaryExpression(f.createPropertyAccessChain(f.createIdentifier('draftTarget'), f.createToken(ts.SyntaxKind.QuestionDotToken), 'title'), ts.SyntaxKind.QuestionQuestionToken, node.initializer))
  }
  if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'inert') {
    return f.updateVariableDeclaration(node, node.name, node.exclamationToken, node.type, f.createBinaryExpression(f.createPrefixUnaryExpression(ts.SyntaxKind.ExclamationToken, f.createIdentifier('draftMode')), ts.SyntaxKind.AmpersandAmpersandToken, f.createParenthesizedExpression(node.initializer)))
  }
  if (ts.isPropertyAssignment(node) && node.name.getText(file) === 'selectedId') {
    return f.updatePropertyAssignment(node, node.name, f.createConditionalExpression(f.createIdentifier('draftMode'), undefined, f.createPropertyAccessChain(f.createIdentifier('draftTarget'), f.createToken(ts.SyntaxKind.QuestionDotToken), 'workspaceId'), undefined, node.initializer))
  }
  return ts.visitEachChild(node, visit, context)
}
const printer = ts.createPrinter({ removeComments: true })
const declarations = body.statements.filter(s => selected.has(s)).map((s) => {
  if (!ts.isFunctionDeclaration(s) || s.name?.text !== 'ConversationRoot')
    return s.getText(file)
  const transformed = ts.transform(s, [(ctx) => {
    context = ctx
    return (fn) => {
      const parameter = fn.parameters[0]
      const name = f.updateObjectBindingPattern(parameter.name, [
        ...parameter.name.elements,
        ...['draftMode', 'draftTarget'].map(key => f.createBindingElement(undefined, undefined, key)),
      ])
      return f.updateFunctionDeclaration(fn, fn.modifiers, fn.asteriskToken, fn.name, fn.typeParameters, [f.updateParameterDeclaration(parameter, parameter.modifiers, parameter.dotDotDotToken, name, parameter.questionToken, parameter.type, parameter.initializer)], fn.type, ts.visitNode(fn.body, visit))
    }
  }])
  const text = printer.printNode(ts.EmitHint.Unspecified, transformed.transformed[0], file)
  transformed.dispose()
  return text
}).join('\n')
const generated = `// @ts-nocheck\n// Generated from DeepSeek Harness 0.1.1-rc.2 (MIT). See THIRD_PARTY_NOTICES.md.\nexport function nativeComposer(require) {\n${declarations}\nreturn { Shell: SessionInputShell, Root: ConversationRoot };\n}\n`
await mkdir(resolve(root, '.generated'), { recursive: true })
await writeFile(resolve(root, '.generated/native-input.ts'), generated)
console.log(`Native input: ${selected.size} declarations, ${Buffer.byteLength(generated)} bytes; sha256 verified`)
