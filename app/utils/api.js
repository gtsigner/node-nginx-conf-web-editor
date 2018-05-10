const axios = require('axios');
const queryString = require('querystring');
const config = require('../../config.json');
const instance = axios.create({
    baseURL: config.API_URL,
    timeout: config.API_TIMEOUT,
    withCredentials: false,
    /*Http Header*/
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/66.0.3359.139 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded'
    }
});
//加入Token在Request拦截器中
instance.interceptors.request.use((conf) => {
    let ret = '';
    conf.data = {
        ...conf.data,
        identifier: config.API_IDENTIFIER,
        secret: config.API_SECRET,
        responsetype: 'json'
    };
    for (let it in conf.data) {
        ret += encodeURIComponent(it) + '=' + encodeURIComponent(conf.data[it]) + '&'
    }
    conf.data = ret;
    return conf;
}, (error) => {
    throw new Error(error);
});

exports.instance = instance;