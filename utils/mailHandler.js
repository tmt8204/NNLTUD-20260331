const nodemailer = require("nodemailer");


const transporter = nodemailer.createTransport({
    host: "sandbox.smtp.mailtrap.io",
    port: 2525,
    auth: {
        user: "da420182a45b1e",
        pass: "1e4a0bd6d14726"
    }
});

module.exports = {
    sendMail: async (to,url) => {
        const info = await transporter.sendMail({
            from: 'Admin@hahah.com',
            to: to,
            subject: "request resetpassword email",
            text: "click vao day de reset", // Plain-text version of the message
            html: "click vao <a href="+url+">day</a> de reset", // HTML version of the message
        });

        console.log("Message sent:", info.messageId);
    },
    sendPasswordMail: async (to, username, password) => {
        const info = await transporter.sendMail({
            from: 'Admin@hahah.com',
            to: to,
            subject: "Thông tin tài khoản của bạn",
            text: `Xin chào ${username},\nTài khoản của bạn đã được tạo.\nMật khẩu: ${password}`,
            html: `<p>Xin chào <b>${username}</b>,</p><p>Tài khoản của bạn đã được tạo thành công.</p><p>Mật khẩu: <b>${password}</b></p><p>Vui lòng đổi mật khẩu sau khi đăng nhập.</p>`,
        });

        console.log("Message sent:", info.messageId);
    }
}