import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const specs = [
  { module: 'conversation', hash: 'fe448ef7e0b1f3e7713dadfc7eff56b9f80d103a2111dfe69c1735ffd0196d61', names: ['SessionInputShell', 'ConversationRoot'], factory: 'nativeComposer', exports: 'Shell: SessionInputShell, Root: ConversationRoot' },
  { module: 'input-trigger', hash: 'e99f77453616c5d6e5e073563d8b8b2786b90990ba8bfcb2ff0d4ea569a22942', names: ['MenuView', 'detectTrigger', 'menuReduce', 'seedGroups', 'MENU_CLOSED'], factory: 'nativeCommandMenu', exports: 'Menu: MenuView, detect: detectTrigger, reduce: menuReduce, seed: seedGroups, closed: MENU_CLOSED' },
  { module: 'commands', hash: '173abdab1a2d986da217a32895ec85b862f68138a538c83d66a62e89188aa7e5', names: ['PopupSelectController', 'PopupSelectView', 'fuzzyCandidates'], factory: 'nativeCommandOptions', exports: 'Popup: PopupSelectController, Options: PopupSelectView, filter: fuzzyCandidates' },
  { module: 'permission-presets', hash: 'cb118541fa83f5e6478ca44894ae62da1009c22a8c8bf6c7f49895caf3923e97', names: ['optionsOf'], factory: 'nativePermissionOptions', exports: 'permissions: optionsOf' },
]
let generated = '// @ts-nocheck\n// Generated from DeepSeek Harness 0.1.1-rc.2 (MIT). See THIRD_PARTY_NOTICES.md.\n'
for (const spec of specs) {
  const path = require.resolve(`@deepseek-ai/dsh-client-ui-${spec.module}/client`)
  const source = await readFile(path, 'utf8')
  if (createHash('sha256').update(source).digest('hex') !== spec.hash)
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
  for (const name of spec.names) {
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
    if (spec.module === 'input-trigger' && ts.isObjectLiteralExpression(node) && node.properties.some(p => ts.isPropertyAssignment(p) && p.name.getText(file) === 'role' && ts.isStringLiteral(p.initializer) && p.initializer.text === 'option')) {
      const reason = f.createPropertyAccessExpression(f.createIdentifier('item'), 'disabledReason')
      return f.updateObjectLiteralExpression(node, [...node.properties, f.createPropertyAssignment(f.createStringLiteral('aria-disabled'), f.createBinaryExpression(reason, ts.SyntaxKind.ExclamationEqualsEqualsToken, f.createIdentifier('undefined'))), f.createPropertyAssignment(f.createStringLiteral('data-dsh-draft-command'), f.createTrue()), f.createPropertyAssignment('title', f.createBinaryExpression(reason, ts.SyntaxKind.QuestionQuestionToken, f.createPropertyAccessExpression(f.createIdentifier('item'), 'description')))])
    }
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
    if (!ts.isFunctionDeclaration(s) || !['ConversationRoot', 'MenuView'].includes(s.name?.text))
      return s.getText(file)
    const transformed = ts.transform(s, [(ctx) => {
      context = ctx
      return (fn) => {
        if (fn.name.text === 'MenuView')
          return ts.visitEachChild(fn, visit, ctx)
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
  generated += `export function ${spec.factory}(require) {\n${declarations}\nreturn { ${spec.exports} };\n}\n`
  console.log(`Native ${spec.module}: ${selected.size} declarations; sha256 verified`)
}
await mkdir(resolve(root, '.generated'), { recursive: true })
await writeFile(resolve(root, '.generated/native-input.ts'), generated)
console.log(`Native input: ${Buffer.byteLength(generated)} bytes`)
