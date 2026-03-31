const express = require('express')
let router = express.Router()
let messageSchema = require('../schemas/message')
let { CheckLogin } = require('../utils/authHandler')
let multer = require('multer')
let path = require('path')
let mongoose = require('mongoose')

let storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
        let ext = path.extname(file.originalname)
        let fileName = Date.now() + '-' + Math.round(Math.random() * 1_000_000_000) + ext
        cb(null, fileName)
    }
})
let upload = multer({ storage })

// GET / - lấy tin nhắn cuối cùng của mỗi cuộc trò chuyện mà user hiện tại tham gia
router.get('/', CheckLogin, async function (req, res, next) {
    let user1 = req.user._id;
    let messages = await messageSchema.find({
        $or: [{
            from: user1
        }, {
            to: user1
        }]
    }).sort({
        createdAt: -1
    })
    let messageMap = new Map();
    user1 = user1.toString();
    for (const message of messages) {
        let keyUser = user1 == message.from.toString() ? message.to.toString() : message.from.toString();
        if (!messageMap.has(keyUser)) {
            messageMap.set(keyUser, message)
        }
    }
    let result = [];
    messageMap.forEach(function (value, key) {
        result.push({
            user: key,
            message: value
        })
    })
    res.send(result)
})


// GET /:userID - lấy toàn bộ tin nhắn giữa user hiện tại và userID
router.get('/:userID', CheckLogin, async (req, res) => {
    try {
        let currentUserId = req.user._id
        let targetUserId = req.params.userID

        let result = await messageSchema.find({
            $or: [
                { from: currentUserId, to: targetUserId },
                { from: targetUserId, to: currentUserId }
            ]
        })
            .populate('from', 'username fullName avatarUrl')
            .populate('to', 'username fullName avatarUrl')
            .sort({ createdAt: 1 })

        res.send(result)
    } catch (error) {
        res.status(500).send({ message: error.message })
    }
})

// POST / - gửi tin nhắn (text hoặc file)
router.post('/', CheckLogin, upload.single('file'), async (req, res) => {
    try {
        let currentUserId = req.user._id
        let { to, text } = req.body

        let messageContent
        if (req.file) {
            messageContent = {
                type: 'file',
                text: req.file.path
            }
        } else {
            messageContent = {
                type: 'text',
                text: text
            }
        }

        let newMessage = new messageSchema({
            from: currentUserId,
            to: to,
            messageContent: messageContent
        })

        await newMessage.save()
        res.send(newMessage)
    } catch (error) {
        res.status(500).send({ message: error.message })
    }
})

module.exports = router
