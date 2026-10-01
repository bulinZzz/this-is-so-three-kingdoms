# 这很三国

一个运行于浏览器的轻量三国战略游戏。历史只作为开局的初始条件，此后由规则驱动世界演化。

## 本地启动

需要 Node.js 20.19 以上。

```bash
npm install
npm run dev
```

终端会输出访问地址，在浏览器中打开该地址即可（默认是 <http://localhost:5173/>）。

## 其他命令

```bash
npm run build    # 类型检查并构建到 dist/
npm run preview  # 预览构建结果
npm test         # 运行规则层测试
```

## 文档

- [项目概览](docs/00-项目概览.md)
- [产品设计](docs/10-产品设计.md)
- [技术设计](docs/20-技术设计.md)
- [迭代计划](docs/90-迭代计划.md)