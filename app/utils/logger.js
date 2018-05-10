const log4js = require('log4js');
// log4js.configure({
//     appenders: {
//         runtime: {type: 'file', filename: `${__dirname}/../runtime/cheese.log`}
//     },
//     categories: {
//         default: {
//             appenders: ['runtime'],
//             level: 'debug'
//         }
//     }
// });
//const logger = log4js.getLogger('runtime');
const logger = log4js.getLogger();
logger.level = 'debug';
module.exports = logger;

