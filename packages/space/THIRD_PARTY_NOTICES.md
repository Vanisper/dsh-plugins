# 第三方许可

构建脚本从以下 DSH 0.1.1-rc.2 发布包按符号依赖提取复用部分，校验源包 SHA-256。状态机逻辑保持不变；根布局通过 AST 添加草稿目标和可编辑状态，菜单添加禁用语义和原因。构建不执行或写入宿主安装文件。

| 包 | 复用内容 | SHA-256 |
| --- | --- | --- |
| `@deepseek-ai/dsh-client-ui-conversation` | 输入状态机及根布局 | `fe448ef7e0b1f3e7713dadfc7eff56b9f80d103a2111dfe69c1735ffd0196d61` |
| `@deepseek-ai/dsh-client-ui-input-trigger` | 菜单视图、触发检测与菜单 reducer | `e99f77453616c5d6e5e073563d8b8b2786b90990ba8bfcb2ff0d4ea569a22942` |
| `@deepseek-ai/dsh-client-ui-commands` | 选项控制器、选项视图与模糊搜索 | `173abdab1a2d986da217a32895ec85b862f68138a538c83d66a62e89188aa7e5` |
| `@deepseek-ai/dsh-client-ui-permission-presets` | 权限选项标签及风险确认元数据 | `cb118541fa83f5e6478ca44894ae62da1009c22a8c8bf6c7f49895caf3923e97` |

项目：DeepSeek Harness（deepseek-ai/deepseek-harness）。以下许可适用于上述复用部分。

```text
MIT License

Copyright (c) 2026 DeepSeek

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
