const Koa = require('koa');
const serve = require('koa-static');
const bodyParser = require('koa-body');
const render = require('koa-ejs');
const path = require('path');
const app = new Koa();
const createRouter = require('./router').createRouter;
app.keys = ['some secret hurr'];
const config = require('../config');
render(app, {
    root: path.join(__dirname, '/../views'),
    //layout: 'template',
    layout: false,
    viewExt: 'ejs',
    cache: false,
    debug: false
});

const staticPath = __dirname + '/../static';
app.use(bodyParser({
    multipart: true
}));

const router = createRouter(app);
app.use(router.routes()).use(router.allowedMethods());
app.use(serve(staticPath));

app.listen(config.APP_PORT, (err, res) => {
    console.log(`Server is running on ${config.APP_PORT}....`)
});