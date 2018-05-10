const NginxConfFile = require('nginx-conf').NginxConfFile;
const fs = require('fs-extra');
const exec = require('child_process').exec;
const logger = require('./logger');
const scandir = require('sb-scandir');
const config = require('../../config');
const path = require('path');

let params = {
    domain: 'blog.oeynet.com',//域名
    listenPort: 80,
    proxyIp: '192.168.19.120',//子网IP
    proxyPort: 8080
};

//主机目录
const vHostsPath = path.join(config.NGINX_VHOSTS_PATH);
const HTTP_CONF_FILE = __dirname + '/../../etc/domain.http.tpl.conf';
const HTTPS_CONF_FILE = __dirname + '/../../etc/domain.https.tpl.conf';
const certsPath = path.join(__dirname, '/../../certs');

/**
 * 拷贝模版到新的路径
 * @param domain
 * @param protocol
 * @returns {Promise<any>}
 */
exports.copyNew = async (domain, protocol) => {
    //Copy新的文件到目录,名字为*.conf
    const newFile = `${vHostsPath}/${domain}.${protocol}.conf`;
    let tplFile;
    if (protocol === 'http') {
        tplFile = HTTP_CONF_FILE;
    } else {
        tplFile = HTTPS_CONF_FILE;
    }
    return new Promise((resolve, reject) => {
        fs.copy(tplFile, newFile, function (err, files) {
            if (err) {
                reject(err)
            } else {
                resolve(newFile);
            }
        });
    })
};


/**
 * 更新nginx host file
 * @param file
 * @param certs
 * @param params
 * @returns {Promise<void>}
 */
exports.update = async (file, certs, params) => {
    return new Promise((resolve, reject) => {
        NginxConfFile.create(file, (err, conf) => {
            if (err) {
                return reject(err);
            }
            conf.on('flushed', function () {
                logger.info(`${file}文件更新成功`);
            });
            const upStream = params.domain.replace(/\./g, '_') + `_${params.protocol}`;
            // conf.nginx.upstream._value = upStream;
            // //UpStream只有一个对象
            // if (conf.nginx.upstream.server.length === 'undefined') {
            //     conf.nginx.upstream.server._value = `${params.proxyIp}:${params.proxyPort}`;
            // }
            let certsRes = null;
            //设置proxy_pass
            if (params.protocol === 'http') {
                conf.nginx.server.server_name._value = `${params.domain}`;
                conf.nginx.server.listen._value = 80;//default 80
                conf.nginx.server.location.proxy_pass._value = `http://${params.proxyIp}:${params.proxyPort}`
            } else {
                conf.nginx.server.server_name._value = `${params.domain}`;
                conf.nginx.server.listen._value = 443;//default 80
                conf.nginx.server.location.proxy_pass._value = `http://${params.proxyIp}:${params.proxyPort}`;
                if (certs.pem && certs.key) {
                    //移动
                    fs.moveSync(certs.pem.path, `${certsPath}/${upStream}/cert.pem`);
                    fs.moveSync(certs.key.path, `${certsPath}/${upStream}/cert.key`);
                } else {
                    //移动默认的
                    return reject('未上传证书文件');
                }
                conf.nginx.server.ssl_certificate._value = `${certsPath}/${upStream}/cert.pem`;
                conf.nginx.server.ssl_certificate_key._value = `${certsPath}/${upStream}/cert.key`;
                certsRes = {
                    pem: conf.nginx.server.ssl_certificate._value,
                    key: conf.nginx.server.ssl_certificate_key._value
                }
            }
            //force the synchronization
            conf.flush();
            resolve({
                ...params,
                name: upStream,
                confFile: file,
                certs: certsRes
            });
        });

    })
};

/**
 * 测试Nginx -t
 * @returns {Promise<void>}
 */
exports.test = async () => {
    return new Promise((resolve, reject) => {
        exec('nginx -t', (err, stdout, stderr) => {
            if (stdout === '') {
                reject(stderr);
            } else {
                resolve(stderr);
            }
        });
    });
};

/**
 * 重启Nginx
 * @returns {Promise<void>}
 */
exports.reload = async () => {
    return new Promise((resolve, reject) => {
        exec('nginx -s reload', (err, stdout, stderr) => {
            resolve(stdout.toString());
        });
    });
};

/**
 * 获取所有的域名文件列表
 * @returns {Promise<void>}
 */
exports.domains = async () => {
    let res = await scandir(vHostsPath, false);
    return res.files;
};
/**
 * 移除Bind
 * @param name
 * @param protocol
 * @returns {Promise<boolean>}
 */
exports.remove = async (name, protocol) => {
    //1.移除certs
    const domain = name.replace(/\_/g, '.');
    let confFile = `${vHostsPath}/${domain}.conf`;
    fs.removeSync(`${certsPath}/${name}`);
    fs.removeSync(confFile);
    logger.info("删除文件:", confFile);
    //2.移除配置文件
    return true;
}