let userController = require('../controllers/users')
let jwt = require('jsonwebtoken')
let fs = require('fs')
module.exports = {
    CheckLogin: async function (req, res, next) {
        let key = req.headers.authorization;
        if (!key) {
            if (req.cookies.LOGIN_NNPTUD_S3) {
                key = req.cookies.LOGIN_NNPTUD_S3;
            } else {
                res.status(401).send("ban chua dang nhap")
                return;
            }

        }

        try {
            if (key.startsWith('Bearer ')) {
                key = key.slice(7).trim();
            }

            let result = jwt.verify(key, 'secretKey')
            if (result.exp * 1000 < Date.now()) {
                res.status(401).send("ban chua dang nhap")
                return;
            }
            let user = await userController.GetUserById(result.id);
            if (!user) {
                res.status(401).send("ban chua dang nhap")
                return;
            }
            req.user = user;
            next();
        } catch (error) {
            res.status(401).send("ban chua dang nhap")
            return;
        }

    },
    CheckRole: function (requiredRole) {
        return function (req, res, next) {
            let user = req.user;
            let currentRole = user.role.name;
            if (requiredRole.includes(currentRole)) {
                next()
            } else {
                res.status(403).send("ban khong co quyen")
            }
        }
    }
}