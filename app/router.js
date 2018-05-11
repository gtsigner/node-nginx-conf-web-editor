const Router = require('koa-router');
const Nginxer = require('./utils/nginxer');

const fs = require('fs-extra');
const DB = require('./utils/nedb');
const logger = require('./utils/logger');
const Api = require('./utils/api').instance;
const queryString = require('querystring');
const md5 = require('md5');
const session = require('koa-session');
const config = require('../config');

/**
 * 检查IP是否在定义的范围馁
 * @param ip
 * @returns {boolean}
 */
function checkProxyIpProducts(ip) {
    for (let i = 0; i < config.PROXY_IP_FILTER.length; i++) {
        let f = config.PROXY_IP_FILTER[i];
        if (-1 !== ip.indexOf(f)) {
            return true;
        }
    }
    return false;
}

/**
 * 获取用户产品
 * @param userId
 * @returns {Promise<Array>}
 */
async function getUserProducts(userId) {
    let res = await Api.post('', {
        action: 'GetClientsProducts',
        clientid: userId,
        stats: true
    });
    const products = res.data.products.product;
    let servers = [];
    products.forEach((item) => {
        if (item.status === 'Active' && checkProxyIpProducts(item.dedicatedip)) {
            servers.push({
                name: item.name,
                domain: item.domain,
                ip: item.dedicatedip,
                servername: item.servername,
            })
        }
    });

    return servers;
}


/**
 * 授权验证器
 * @param ctx
 * @param next
 * @returns {Promise<*|undefined|Router|Response>}
 */
async function authorize(ctx, next) {
    const sess = ctx.session;
    if (!sess.user) {
        return ctx.redirect('/login.html');
    }
    if (sess.user._id === config.AdminId) {
        sess.user.isAdmin = true;
        sess.user.typeName = "管理员";
    } else {
        sess.user.typeName = "普通用户"
    }
    ctx.user = sess.user;
    await next();
}

exports.createRouter = (app) => {
    const router = new Router();
    router.use(session({
        key: 'sess_', /** (string) cookie key (default is koa:sess) */
        /** (number || 'session') maxAge in ms (default is 1 days) */
        /** 'session' will result in a cookie that expires when session/browser is closed */
        /** Warning: If a session cookie is stolen, this cookie will never expire */
        maxAge: 86400000,
        overwrite: true,
        /** (boolean) can overwrite or not (default true) */
        httpOnly: true,
        /** (boolean) httpOnly or not (default true) */
        signed: true,
        /** (boolean) signed or not (default true) */
        rolling: false,
        /** (boolean) Force a session identifier cookie to be set on every response. The expiration is reset to the original maxAge, resetting the expiration countdown. (default is false) */
        renew: false, /** (boolean) renew session when session is nearly expired, so we can always keep user logged in. (default is false)*/
    }, app));

    router.use(['/domain'], authorize);

    router.get('/', authorize, async (ctx, next) => {
        await ctx.render('index', {
            user: ctx.user
        });
    });

//Model：｛ _id,domain,type,proxyIp,proxyPort,certsPath｝
    router.post('/domain/bind', async (ctx, next) => {
        const params = ctx.request.body.fields;

        params.domain = params.domain.trim();
        params.proxyIp = params.proxyIp.trim();
        params.proxyPort = params.proxyPort.trim();

        const certs = ctx.request.body.files;

        //全部空
        if (params.protocol === '' || params.domain === '' || params.proxyIp === '' || params.proxyPort === '') {
            return await ctx.render('error', {
                error: {
                    msg: '请检查绑定参数'
                }
            })
        }
        //验证域名
        if (/^(?=^.{3,255}$)[a-zA-Z0-9][-a-zA-Z0-9]{0,62}(\.[a-zA-Z0-9][-a-zA-Z0-9]{0,62})+$/.test(params.domain) === false) {
            return await ctx.render('error', {
                error: {
                    msg: '域名格式错误'
                }
            });
        }
        //验证协议
        if (params.protocol !== 'http' && params.protocol !== 'https') {
            return await ctx.render('error', {
                error: {
                    msg: '协议选择错误'
                }
            });
        }

        //验证proxyIP
        if (!ctx.user.isAdmin) {
            const servers = await getUserProducts(ctx.user._id);
            let serv = servers.filter((it) => {
                return it.ip === params.proxyIp;
            });
            if (serv.length === 0) {
                return await ctx.render('error', {
                    error: {
                        msg: '您选择的产品不存在'
                    }
                });
            }
        }

        //验证域名和协议是否存在
        let ext = await DB.findOne({domain: params.domain, protocol: params.protocol});
        if (ext) {
            return await ctx.render('error', {
                error: {msg: "存在重复的域名+协议规则"}
            })
        }
        try {
            let newFile = await Nginxer.copyNew(params.domain, params.protocol);
            let res = await Nginxer.update(newFile, certs, {
                ...params
            });
            let test = Nginxer.test();//先测试文件是否异常
            await Nginxer.reload();
            await DB.insert({
                ...res,
                protocol: params.protocol,
                _userId: ctx.user._id
            });
            ctx.redirect('/');
        } catch (e) {
            return await ctx.render('error', {
                error: {msg: e.message}
            })
        }
    });

    /**
     * 获取产品信息
     */
    router.get('/domain/products', async (ctx, next) => {
        try {
            ctx.body = await getUserProducts(ctx.user._id);
        } catch (e) {
            ctx.status = 500;
            ctx.body = {message: `请求失败,${e.message}`}
        }
    });
    /**
     * 获取列表
     */
    router.get('/domain/lists', async (ctx, next) => {
        try {
            if (ctx.user.isAdmin) {
                ctx.body = await DB.find({});
            } else {
                const uid = ctx.user._id;
                ctx.body = await DB.find({_userId: uid});
            }
        } catch (e) {
            ctx.status = 500;
        }
    });

    /**
     * 删除
     */
    router.delete('/domain/remove/:id', async (ctx, next) => {
        try {
            const id = ctx.params.id;
            let where = {_id: id};
            if (!ctx.user.isAdmin) {
                where._userId = ctx.user._id;
            }
            const bind = await DB.findOne(where);
            await Nginxer.remove(bind.name, bind.protocol);//移除配置文件
            await DB.remove({_id: id});
            ctx.body = {'message': 'success', code: 100};
        } catch (e) {
            ctx.body = {'message': e.message, code: 104};
        }
    });

    /**
     * 登录授权
     */
    router.post('/auth/login', async (ctx, next) => {
        try {
            ctx.session.user = null;
            const params = ctx.request.body;
            const email = params.email;
            const password = params.password;
            if (email === '' || password === '') {
                throw new Error('邮箱账号或者密码不能为空');
            }
            if (email === config.AdminUsername && password === config.AdminPassword) {
                ctx.session.user = {
                    _id: config.AdminId
                }
                return ctx.redirect('/');
            }

            const requestParams = {
                action: 'ValidateLogin',
                email: email,
                password2: password
            };
            const res = await Api.post('', requestParams);

            let remoteRet = res.data;
            if (remoteRet.result !== 'success') {
                throw new Error('对不起,登录失败');
            }
            ctx.session.user = {_id: remoteRet.userid, ...remoteRet};
            ctx.body = {
                ...remoteRet
            };
            ctx.redirect('/');
        } catch (e) {
            let data = {};
            if (e.response && e.response.data) {
                e.message += JSON.stringify(e.response.data);
                data = e.response.data;
            }
            return await ctx.render('error', {
                error: {msg: `登录失败,${e.message}`, data: data}
            });
        }
    });

    return router;
};