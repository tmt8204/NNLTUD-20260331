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
router.get('/', CheckLogin, async (req, res) => {
    try {
        let currentUserId = req.user._id

        let result = await messageSchema.aggregate([
            {
                $match: {
                    $or: [
                        { from: new mongoose.Types.ObjectId(currentUserId) },
                        { to: new mongoose.Types.ObjectId(currentUserId) }
                    ]
                }
            },
            { $sort: { createdAt: -1 } },
            {
                $addFields: {
                    conversationKey: {
                        $cond: {
                            if: { $gt: [{ $toString: '$from' }, { $toString: '$to' }] },
                            then: { $concat: [{ $toString: '$to' }, '_', { $toString: '$from' }] },
                            else: { $concat: [{ $toString: '$from' }, '_', { $toString: '$to' }] }
                        }
                    }
                }
            },
            {
                $group: {
                    _id: '$conversationKey',
                    lastMessage: { $first: '$$ROOT' }
                }
            },
            { $replaceRoot: { newRoot: '$lastMessage' } },
            {
                $lookup: {
                    from: 'users',
                    localField: 'from',
                    foreignField: '_id',
                    as: 'from',
                    pipeline: [{ $project: { username: 1, fullName: 1, avatarUrl: 1 } }]
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'to',
                    foreignField: '_id',
                    as: 'to',
                    pipeline: [{ $project: { username: 1, fullName: 1, avatarUrl: 1 } }]
                }
            },
            { $unwind: '$from' },
            { $unwind: '$to' },
            { $sort: { createdAt: -1 } }
        ])

        res.send(result)
    } catch (error) {
        res.status(500).send({ message: error.message })
    }
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
