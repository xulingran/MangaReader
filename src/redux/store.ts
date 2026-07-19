import { configureStore } from '@reduxjs/toolkit';
import { reducer } from './slice';
import createSagaMiddleware from 'redux-saga';
import saga from './saga';

const sagaMiddleware = createSagaMiddleware();
const middleware = [sagaMiddleware];

const store = configureStore({
  reducer,
  middleware,
  // Redux state 包含完整离线漫画字典；逐 action 打印/序列化会让低性能真机明显卡顿。
  devTools: false,
});
// jest 环境下不启动 saga：异步副作用在测试环境拆解后会访问已销毁的模块注册表
if (process.env.NODE_ENV !== 'test') {
  sagaMiddleware.run(saga);
}

export default store;
