## README
一个实现对接whmcs管理用户产品实现Nginx反向代理操作工具


https://developers.whmcs.com/api-reference/getclientsproducts/


## Usage
复制默认配置文件
```
cp config.example.json config.json
```

## ScreenShots
![](./screemshots/1.png)
![](./screemshots/2.png)
![](./screemshots/3.png)
![](./screemshots/4.png)
![](./screemshots/5.png)

## dependencies
```json
{
  "dependencies": {
    "axios": "^0.18.0",
    "copy": "^0.3.1",
    "fs-extra": "^6.0.0",
    "koa": "^2.5.1",
    "koa-body": "^2.5.0",
    "koa-bodyparser": "^4.2.0",
    "koa-ejs": "^4.1.1",
    "koa-router": "^7.4.0",
    "koa-session": "^5.8.1",
    "koa-static": "^4.0.2",
    "log4js": "^2.5.3",
    "md5": "^2.2.1",
    "nedb": "^1.8.0",
    "nedb-promise": "^2.0.1",
    "nginx-conf": "^1.4.0",
    "sb-scandir": "^2.0.0",
    "uuid": "^3.2.1",
    "validator": "^10.2.0"
  }
}
```