/**
 * src/logic/logger.js
 *
 * 開発用ログの入口。IMPLEMENTATION_PLAN.md 13.4。
 *
 * 本番ビルドでは debug / info は何も出さない。
 * 生徒名・ユーザーID・回答履歴が本番コンソールへ大量に流れるのを防ぐため。
 * 手元で見たいときは .env.local に REACT_APP_DEBUG_LOG=true を書く。
 *
 * warn / error は本番でも出す。障害の切り分けに要るため。
 */

const isDevelopment = process.env.NODE_ENV === 'development';
const isDebugEnabled = process.env.REACT_APP_DEBUG_LOG === 'true';

export const debugLoggingEnabled = isDevelopment || isDebugEnabled;

const noop = () => {};

export const logger = {
  debug: debugLoggingEnabled ? console.log.bind(console) : noop,
  info: debugLoggingEnabled ? console.info.bind(console) : noop,
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

export default logger;
