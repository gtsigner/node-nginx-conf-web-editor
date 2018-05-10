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
        if (item.status === 'Active') {
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
        const certs = ctx.request.body.files;

        //全部空
        if (params.domain === '' || params.proxyIp === '' || params.proxyPort === '') {
            return await ctx.render('error', {
                error: {
                    msg: '请检查绑定参数'
                }
            })
        }

        let newFile = await Nginxer.copyNew(params.domain);
        let res = await Nginxer.update(newFile, certs, {
            ...params
        });
        await Nginxer.reload();
        await DB.insert({
            ...res,
            _userId: ctx.user._id
        });
        ctx.redirect('/');
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
            await Nginxer.remove(bind.confFile);
            await DB.remove({_id: id});
            ctx.body = {'message': 'success', code: 100};
        } catch (e) {
            ctx.body = {'message': e.message, code: 104};
        }
    });

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
            if (e.response && e.response.data) {
                e.message += e.response.data;
            }
            return await ctx.render('error', {
                error: {msg: `登录失败,${e.message}`}
            });
        }
    });

    return router;
};