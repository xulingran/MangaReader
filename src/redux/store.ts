import { configureStore } from '@reduxjs/toolkit';
import { reducer } from './slice';
import createSagaMiddleware from 'redux-saga';
import saga from './saga';

const sagaMiddleware = createSagaMiddleware();
const middleware = [sagaMiddleware];

if (__DEV__) {
  const { logger } = require('redux-logger');
  middleware.push(logger);
}

const store = configureStore({
  reducer,
  middleware,
  devTools: __DEV__,
});
// jest 环境下不启动 saga：异步副作用在测试环境拆解后会访问已销毁的模块注册表
if (process.env.NODE_ENV !== 'test') {
  sagaMiddleware.run(saga);
}

export default store;
