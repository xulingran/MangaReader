// 必须在任何 import App/redux 之前执行：
// initialState（src/redux/slice.ts）在模块求值时读取 process.env.*，
// 而 ES import 会被提升到 index.js 函数体之前求值，
// 所以 env 注入要放在这个被最先 import 的模块里。
import { name } from './app.json';
import { version, publishTime } from './package.json';

process.env.NAME = name;
process.env.VERSION = 'v' + version;
process.env.PUBLISH_TIME = publishTime;
