// 应用的其余 require 需要被放到 hook 后面
const app = require('./app');


var NginxConfFile = require('nginx-conf').NginxConfFile;


let params = {
    domain: 'blog.oeynet.com',//域名
    listenPort: 80,
    proxyIp: '192.168.19.120',//子网IP
    proxyPort: 8080
}

NginxConfFile.create('./etc/oeynet.com.conf', function (err, conf) {
    if (err) {
        console.log(err);
        return;
    }

    conf.on('flushed', function () {
        console.log('finished writing to disk');
    });

    conf.nginx.upstream._value = params.domain.replace(/\./g, '_');
    //如果是对象
    if (conf.nginx.upstream.server.length === 'undefined') {
        conf.nginx.upstream.server._value = `${params.proxyIp}:${params.proxyPort}`;
    }

    //设置proxy_pass
    if (conf.nginx.server.length === 'undefined') {
        conf.nginx.server.server_name._value = `${params.domain}`;
        conf.nginx.server.listen._value = params.listenPort;
        conf.nginx.server.location.proxy_pass._value = `http://${params.proxyIp}:${params.proxyPort}`
    } else {
        //第一个是Http

        //第二个是Https，然后用户上传证书，保存到本地，配置证书路径

    }
    //force the synchronization
    conf.flush();
});