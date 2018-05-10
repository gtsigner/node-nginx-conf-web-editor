const Nginxer = require('../app/utils/nginxer');

Nginxer.test().then((res) => {
    console.log(res);
})