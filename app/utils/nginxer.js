const NginxConfFile = require('nginx-conf').NginxConfFile;
const fs = require('fs-extra');
const exec = require('child_process').exec;
const logger = require('./logger');
const scandir = require('sb-scandir');
let params = {
    domain: 'blog.oeynet.com',//域名
    listenPort: 80,
    proxyIp: '192.168.19.120',//子网IP
    proxyPort: 8080
};

//主机目录
const vHostsPath = __dirname + '/../../etc/vhosts';
const tplFile = __dirname + '/../../etc/domain.tpl.conf';
const certsPath = __dirname + '/../../certs';
const ETC_PATH = __dirname + '/../../etc';
/**
 * 拷贝模版到新的路径
 * @param domain
 * @returns {Promise<any>}
 */
exports.copyNew = async (domain) => {
    //Copy新的文件到目录,名字为*.conf
    const newFile = `${vHostsPath}/${domain}.conf`
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
            const upStream = params.domain.replace(/\./g, '_');
            conf.nginx.upstream._value = upStream;
            //UpStream只有一个对象
            if (conf.nginx.upstream.server.length === 'undefined') {
                conf.nginx.upstream.server._value = `${params.proxyIp}:${params.proxyPort}`;
            }

            //设置proxy_pass
            if (conf.nginx.server.length === 'undefined') {
                conf.nginx.server.server_name._value = `${params.domain}`;
                conf.nginx.server.listen._value = params.listenPort;
                conf.nginx.server.location.proxy_pass._value = `http://${upStream}`
            } else {
                //第一个是Http
                conf.nginx.server[0].server_name._value = `${params.domain}`;
                conf.nginx.server[0].listen._value = 80;
                conf.nginx.server[0].location.proxy_pass._value = `http://${upStream}`
                //第二个是Https，然后用户上传证书，保存到本地，配置证书路径

                conf.nginx.server[1].server_name._value = `${params.domain}`;
                conf.nginx.server[1].listen._value = 443;
                conf.nginx.server[1].location.proxy_pass._value = `http://${upStream}`
                if (certs.pem && certs.key) {
                    //移动
                    fs.moveSync(certs.pem.path, `${certsPath}/${upStream}/cert.pem`);
                    fs.moveSync(certs.key.path, `${certsPath}/${upStream}/cert.key`);
                } else {
                    //移动默认的
                    fs.copySync(`${ETC_PATH}/certs`, `${certsPath}/${upStream}`);
                }

                conf.nginx.server[1].ssl_certificate._value = `${certsPath}/${upStream}/cert.pem`;
                conf.nginx.server[1].ssl_certificate_key._value = `${certsPath}/${upStream}/cert.key`;
            }
            //force the synchronization
            conf.flush();

            resolve({
                ...params,
                name: upStream,
                confFile: file,
                certs: {
                    pem: conf.nginx.server[1].ssl_certificate._value,
                    key: conf.nginx.server[1].ssl_certificate_key._value
                }
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
 */
exports.remove = async (name) => {
    //1.移除certs
    fs.removeSync(`${certsPath}/name`);
    fs.removeSync(`${vHostsPath}/${name}.conf`);
    //2.移除配置文件
    return true;
}