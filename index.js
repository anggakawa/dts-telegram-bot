require('dotenv').config();

const Telegraf = require('telegraf');
const session = require('telegraf/session');
const Scene = require('telegraf/scenes/base');
const WizardScene = require('telegraf/scenes/wizard');
const AWS = require('aws-sdk');
const S3 = new AWS.S3();
const mysql = require('mysql2');
const util = require('util');
const Stage = require('telegraf/stage');
const Markup = require('telegraf/markup');
const {
    enter,
    leave
} = Stage;

// checking webhook
//const http = require('http');

const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DBNAME,
    connectTimeout: 50000,
});

const KODE_RAHASIA = 'DOSEN123';

/**

 * Fungsi:

 * Pelajar dan Pengajar dapat melakukan registrasi (DONE)
 * Pelajar dapat melihat jadwal belajar. (DONE)
 * Pelajar dapat melihat pengumuman seputar kegiatan belajar mengajar.(DONE)
 * Pengajar dapat menyebarkan materi pelajaran ataupun tugas secara otomatis.
 * Pelajar dapat melihat materi yang diunggah oleh Pengajar.

 */

// fungsi untuk registrasi umum (pelajar)
const registrationWizard = new WizardScene('registration-wizard',
    (ctx) => {
        ctx.reply('Silahkan masukkan nama anda');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.user_name = ctx.message.text;
        connection.query(`INSERT INTO users (username, telegram_id, can_write) VALUES ( '${ctx.wizard.state.user_name}', '${ctx.from.id}', FALSE )`,
            (error, result) => {
                if (error) {
                    ctx.reply('Tidak dapat memasukkan nama anda, anda sudah terdaftar ke dalam sistem kami!');
                    console.log(error);
                } else {
                    ctx.reply('Nama anda sudah tersimpan, halo ' + ctx.wizard.state.user_name);
                    return ctx.scene.leave();
                }
            })
    }
);

//fungsi untuk registrasi khusus pengajar
const specialregistrationWizard = new WizardScene('special-registration-wizard',
    (ctx) => {
        ctx.reply('Silahkan masukkan nama anda');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.user_name = ctx.message.text;
        ctx.reply('Silahkan masukkan kode rahasia...');
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.message.text === KODE_RAHASIA) {
            connection.query(`INSERT INTO users (username, telegram_id, can_write) VALUES ( '${ctx.wizard.state.user_name}', '${ctx.from.id}', TRUE )`,
                (error, result) => {
                    if (error) {
                        ctx.reply('Tidak dapat memasukkan nama anda, anda sudah terdaftar ke dalam sistem kami!');
                        console.log(error);
                    } else {
                        ctx.reply('Nama anda sudah tersimpan, halo ' + ctx.wizard.state.user_name);
                        return ctx.scene.leave();
                    }
                })

        } else {
            ctx.reply('ANDA BUKAN PENGAJAR');
            return ctx.scene.leave();
        }
    }
);

//fungsi untuk menambah pengumuman oleh dosen
const addAnnouncementWizard = new WizardScene('add-announcement',
    (ctx) => {
        connection.query(`SELECT can_write FROM users WHERE telegram_id = '${ctx.from.id}' LIMIT 1`,
            (err, res) => {
                if (res[0].can_write) {
                    ctx.wizard.state.ability = true;
                    ctx.reply('Anda berhasil masuk', Markup.keyboard(['OK']).resize().oneTime().extra());
                } else {
                    ctx.wizard.state.ability = false;
                    ctx.reply('Anda tidak memiliki hak untuk masuk', Markup.keyboard(['OK']).resize().oneTime().extra());
                }
            }
        );
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.wizard.state.ability) {
            ctx.reply('Masukkan title');
            return ctx.wizard.next();
        } else {
            return ctx.scene.leave();
        }
    },
    (ctx) => {
        ctx.wizard.state.title = ctx.message.text;
        ctx.reply('Masukkan pengumuman');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.content = ctx.message.text;
        connection.query(`INSERT INTO announcements (title, content) VALUES ('${ctx.wizard.state.title}',
            '${ctx.wizard.state.content}')`, (err, res) => {
                if (err) {
                    ctx.reply('terjadi kesalahan, harap lakukan lagi');
                } else {
                    ctx.reply('data telah berhasil disimpan');
                }
            });
        return ctx.scene.leave();

    }
);

// fungsi untuk menambah jadwal
const addScheduleWizard = new WizardScene('add-schedule',
    (ctx) => {
        connection.query(`SELECT can_write FROM users WHERE telegram_id = '${ctx.from.id}' LIMIT 1`, (err, res) => {
            if (res[0].can_write) {
                ctx.wizard.state.ability = true;
                ctx.reply('Anda berhasil masuk', Markup.keyboard(['OK']).resize().oneTime().extra());
            } else {
                ctx.wizard.state.ability = false;
                ctx.reply('Anda tidak berhak untuk memakai fungsi ini', Markup.keyboard(['OK']).resize().oneTime().extra());
            }
        });
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.wizard.state.ability) {
            ctx.reply('Masukkan nama course');
            return ctx.wizard.next();
        } else {
            return ctx.scene.leave();
        }
    },
    (ctx) => {
        ctx.wizard.state.course_name = ctx.message.text;
        ctx.reply('Masukkan jadwal course tersebut, misal setiap hari selasa jam 8 pagi');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.schedule = ctx.message.text;
        connection.query(`INSERT INTO schedules (course, schedule_time) VALUES ('${ctx.wizard.state.course_name}', '${ctx.wizard.state.schedule}')`, (err, res) => {
            if (err) {
                ctx.reply('Terjadi kesalahan, harap lakukan lagi');
            } else {
                ctx.reply('Data telah berhasil disimpan');
            }
        });
        return ctx.scene.leave();
    }
);

const downloadFileWizard = new WizardScene('download-file-wizard',
    (ctx) => {
        connection.query(`SELECT * FROM materials`, (err, res) => {
            if (err) {
                ctx.reply('Tidak dapat menemukan list file');
                return ctx.scene.leave();
            } else {
                ctx.reply('jawab dengan nama file untuk mengunduh');
                res.forEach(material => ctx.reply(`${material.keyname}`));
                return ctx.wizard.next();
            }
        });
    },
    (ctx) => {
        ctx.wizard.state.id = ctx.message.text;
        const params = {
            Bucket: 'course-assistant-materials',
            Key: ctx.wizard.state.id,
        };
        S3.getObject(params).promise().then(data => {
            ctx.telegram.sendDocument(ctx.from.id, {
                source: data.Body,
                filename: params.Key,
            });
        });
    }
);

const app = new Telegraf(process.env.BOT_TOKEN);
const stage = new Stage([registrationWizard, specialregistrationWizard, addAnnouncementWizard, addScheduleWizard, downloadFileWizard], {
    ttl: 60
});

app.use(session());
//app.use(commandParts());
app.use(stage.middleware());

var params = {
    Bucket: 'course-assistant-materials',
    Key: 'Hands On AWS - CodeDeploy.docx'
};

app.hears('hi', ctx => ctx.reply('Hey there!'));
app.command('tambahjadwal', enter('add-schedule'));
app.command('jadwal', ctx => {
    connection.query(`SELECT course, schedule_time FROM schedules`, (err, res) => {
        if (err) {
            ctx.reply('Tidak dapat mengambil data dari server');
        } else {
            res.forEach((message) => {
                ctx.replyWithMarkdown(`*${message.course}*\n ${message.schedule_time}`);
            })
        }
    })
});
/*
app.command('materi', ctx => {
    S3.getObject(params).promise().then(data => {
        ctx.telegram.sendDocument(ctx.from.id, {
            source: data.Body,
            filename: params.Key,
        });
    });
});
*/
app.command('materi', enter('download-file-wizard'));
app.command('database', ctx => {
    connection.query('SELECT 1 + 1 AS solution', (err, result) => {
        ctx.reply(result);
    });
});
app.command('registration', enter('registration-wizard'));
app.command('specialregis', enter('special-registration-wizard'));
app.command('announce', enter('add-announcement'));
app.command('announcements', (ctx) => {
    connection.query(`SELECT title, content, date FROM announcements ORDER BY date DESC`, (err, res) => {
        if (err) {
            ctx.reply('Tidak dapat mengambil data dari server');
        } else {
            res.forEach((message) => {
                ctx.replyWithMarkdown(`_${message.date}_ \t *${message.title}* \n\n ${message.content}`);
            });
        }
    })
});

// comment line below if u want to implement to lambda
app.launch(console.log('running telegram...'));


/* AWS Lambda handler function */
/**
exports.handler = (event, context, callback) => {
    const tmp = JSON.parse(event.body); // get data passed to us
    app.handleUpdate(tmp); // make Telegraf process that data
    return callback(null, { // return something for webhook, so it doesn't try to send same stuff again
         statusCode: 200,
        body: '',
    });
};
*/
// webhook set
// https://api.telegram.org/bot810519902:AAHaEr9O0xf_TSD2KQ0LOy32ymM6Dxx56Vg/setWebhook?url=
