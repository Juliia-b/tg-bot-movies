let TelegramBot = require('node-telegram-bot-api');
let importConfig = require('./config');

let token = importConfig.token;

let MongoClient = require('mongodb').MongoClient;
let url = "mongodb+srv://ula:ula@cluster-for-vk-auth-6gk24.mongodb.net/test?retryWrites=true&w=majority";
let db;
let client;

(async function() {
    client = await MongoClient.connect(url, { useNewUrlParser: true, useUnifiedTopology: true });
    db = client.db('tgBot');
}());

require('https').createServer().listen(process.env.PORT || 8443).on('request', function(req, res) {
    res.end('')
});

let bot = new TelegramBot(token, { polling: true });

bot.getMe().then(function(me) {
    console.log('--------------------------------------------------------------------')
    console.log('Запущено')
    console.log('--------------------------------------------------------------------')
});

/*
 *Опции для кнопок
 */
let theMenuOpt = {
    "reply_markup": {
        "keyboard": [
            ["Добавить фильм"],
            ["Удалить фильм"]
        ]
    }
}

let theFilmOpt = {
    "reply_markup": {
        "keyboard": [
            ["Вернуться в главное меню", "Отменить последний ввод"],
            ["Отправить фильм на канал"]
        ]
    }
}

let sessionStack = []

bot.onText(/\/start/, async function(msg) {
    let isAdmin = await IsItAdmin(msg.from.id);

    RemoveSessionFromMongo(msg.from.id)

    if (isAdmin) {
        bot.sendMessage(msg.from.id, "Вы в списке администраторов, операция разрешена", theMenuOpt);
    } else {
        bot.sendMessage(msg.from.id, 'В разработке');
    }
})

bot.on('photo', async function(msg) {
    let user_id = msg.from.id;
    let photo = msg.photo[0].file_id;
    let caption = msg.caption;

    let isAdmin = await IsItAdmin(msg.from.id);

    if (!isAdmin) {
        bot.sendMessage(user_id, 'В разработке');
        return
    }

    let sessionVal = await CheckSessionValInMongo(user_id);

    if (sessionVal) {
        CheckAndPushText(caption, user_id);

        PutSessionToMongo('photo', user_id, photo);
        bot.sendMessage(user_id, 'Фото принято', theFilmOpt)

    } else {
        bot.sendMessage(user_id, 'Перед отправкой необходимо начать сессию нажатием кнопки "Добавить фильм"', theMenuOpt);
    }
})

bot.on('video', async function(msg) {
    let user_id = msg.from.id;
    let duration = msg.video.duration;
    let video = msg.video.file_id;
    let caption = msg.caption;

    let isAdmin = await IsItAdmin(msg.from.id);
    if (!isAdmin) {
        bot.sendMessage(user_id, 'В разработке');
        return
    }

    let sessionVal = await CheckSessionValInMongo(user_id);

    if (sessionVal) {

        CheckAndPushText(caption, user_id);

        // Если длина видео меньше 5-ти минут, то используем видео как трейлер
        if (duration < 300) {
            PutSessionToMongo('trailer', user_id, video)
            let ans = await bot.sendMessage(user_id, 'Трейлер принят', theFilmOpt)
            console.log("ans : ", ans)
        } else {
            PutSessionToMongo('film', user_id, video)
            bot.sendMessage(user_id, 'Фильм принят', theFilmOpt);
        }

    } else {
        bot.sendMessage(user_id, 'Перед отправкой необходимо начать сессию нажатием кнопки "Добавить фильм"', theMenuOpt)
    }
})

bot.on('text', async function(msg) {
    let user_id = msg.from.id;
    let text = msg.text;

    let isAdmin = await IsItAdmin(msg.from.id);
    if (!isAdmin) {
        bot.sendMessage(user_id, 'В разработке');
        return
    }

    let sessionVal = await CheckSessionValInMongo(user_id);
    let notButton = await IsNotButton(text);

    if (sessionVal && notButton) {
        CheckAndPushText(text, user_id);
    } else if (!sessionVal && notButton) {
        bot.sendMessage(user_id, 'Перед отправкой выберите опцию', theMenuOpt);
    }
})

bot.on('text', async function(msg) {
    let messageChatId = msg.chat.id;
    let user_id = msg.from.id;

    let isAdmin = await IsItAdmin(user_id);

    if (msg.text == "Вернуться в главное меню" && isAdmin) {
        RemoveSessionFromMongo(user_id)
        bot.sendMessage(msg.chat.id, "Переход в главное меню", theMenuOpt);
    } else

    if (msg.text == "Добавить фильм" && isAdmin) {
        PutSessionToMongo('id', user_id);
        bot.sendMessage(messageChatId, "Предоставьте текст, фильм, трейлер и фото", theFilmOpt);
    } else

    if (msg.text == "Отправить фильм на канал" && isAdmin) {
        let doc = await CheckParamsInMongo(user_id);

        if (doc.necessaryFieldsToSend.length == 0) {
            bot.sendMessage(messageChatId, "Сборка завершена. Отправка на канал", theMenuOpt);

            let allDoc = await db.collection("session").find({ id: user_id }).toArray();

            let photo = allDoc[0].photo;
            let trailer = allDoc[0].trailer;
            let text = allDoc[0].text;
            let film = allDoc[0].film;

            let movieName = allDoc[0].movieName;
            let categories = allDoc[0].categories;

            let chatId = -1001377348186; // Чат, куда отправляется сборка
            let mediaGroup = await CheckValuesAndPutToMediaGroup(photo, trailer, text, film);
            await bot.sendMediaGroup(chatId, mediaGroup, theMenuOpt);

            let rer = await IsInMongo(movieName)

            if (rer == false) {
                console.log('кладу в монго')
                PutToMongo(movieName, message_id, categories, returned_date);
            } else {
                console.log('уже в монго')
            }

            RemoveSessionFromMongo(user_id)

        } else {
            let str = '';

            if (doc.necessaryFieldsToSend.length == 2) {
                str = doc.necessaryFieldsToSend[0] + ' и ' + doc.necessaryFieldsToSend[1]
            } else {
                str = doc.necessaryFieldsToSend[0]
            }

            bot.sendMessage(messageChatId, "Недостаточно данных. Добавьте: " + str, theFilmOpt)
        }
    } else

    if (msg.text == "Удалить фильм" && isAdmin) {
        bot.sendMessage(messageChatId, "Данная функциональность ещё не добавлена", theMenuOpt)
    } else

    if (msg.text == "Отменить последний ввод" && isAdmin) {
        RemoveLastParamFromMongo(messageChatId)
    }
})

async function CheckValuesAndPutToMediaGroup(photo, trailer, text, film) {

    let mediaGroup = new Array();

    if (film !== undefined && text !== undefined) {
        let par = { type: 'video', media: film, caption: text };
        mediaGroup.push(par)
    }
    if (trailer !== undefined) {
        let par = { type: 'video', media: trailer };
        mediaGroup.push(par)
    }
    if (photo !== undefined) {
        let par = { type: 'photo', media: photo };
        mediaGroup.push(par)
    }

    return mediaGroup;
}

async function CheckAndPushText(text, user_id) {
    let notButton = await IsNotButton(text);

    if (notButton) {
        let ans = await isTextTrue(text, user_id);
        if (ans) {
            PutSessionToMongo('text', user_id, text);
            bot.sendMessage(user_id, 'Текст принят', theFilmOpt);
        } else {
            bot.sendMessage(user_id, 'Ошибка. Текст не соответствует требованиям. Введите текст в формате: \n  \nНазвание фильма (год) \n#жанр1 #жанр2 \nОписание фильма. \n \nЕсли жанр состоит из двух и более слов, то необходимо ввести его в формате #исторический_фильм (через нижнее подчёркивание).', theFilmOpt)
        }
    }
}

async function PutSessionToMongo(nameOfParam, id, param) {

    if (nameOfParam == 'id') {
        db.collection("session").updateOne({ id: id }, { $set: { session: 1 } }, { upsert: true });
        return
    }

    if (nameOfParam == 'film') {
        sessionStack.push('film');
        db.collection("session").updateOne({ id: id }, { $set: { film: param } }, { upsert: true })
    } else if (nameOfParam == 'text') {
        sessionStack.push('text');
        db.collection("session").updateOne({ id: id }, { $set: { text: param } }, { upsert: true })
    } else if (nameOfParam == 'trailer') {
        sessionStack.push('trailer');
        db.collection("session").updateOne({ id: id }, { $set: { trailer: param } }, { upsert: true })
    } else if (nameOfParam == 'photo') {
        sessionStack.push('photo');
        db.collection("session").updateOne({ id: id }, { $set: { photo: param } }, { upsert: true })
    } else if (nameOfParam == 'movieName') {
        db.collection("session").updateOne({ id: id }, { $set: { movieName: param } }, { upsert: true })
    } else if (nameOfParam == 'categories') {
        db.collection("session").updateOne({ id: id }, { $set: { categories: param } }, { upsert: true })
    }
}

/*
 *Возвращает true, если сессия начата
 */
async function CheckSessionValInMongo(id) {
    let doc = await db.collection("session").find({ id: id }).toArray();
    if (doc.length == 0) {
        return false;
    }

    if (doc[0].session == undefined) {
        return false;
    }

    return true;
}

/*
 *Функция для проверки соответствования текста требованиям.
 */
async function isTextTrue(messageText, user_id) {
    let movieName = messageText.match(/(.*)\(/gm);
    if (movieName == null) {
        return false
    }

    let categories = messageText.toString().match(/#{1}[a-zA-Z-а-яА-ЯёЁ_]{1,}/g); //хеши
    if (categories == null) {
        return false
    }

    movieName = movieName[0].replace('(', '').trim();

    for (let i = 0; i < categories.length; i++) {
        categories[i] = categories[i].replace('#', '').replace('_', ' ').trim()
    }

    PutSessionToMongo('movieName', user_id, movieName);
    PutSessionToMongo('categories', user_id, categories);

    return true
}

/*
 *Класть в монго информацию по карточке фильма, после отправки на канал
 */
function PutToMongo(movieName, message_id, categories, messageDate) {

    let putObject = { movieName: movieName, message_id: message_id, categories: categories, messageDate: messageDate }

    db.collection("films").insertOne(putObject, function(err, res) {
        if (err) throw err;
        console.log("1 document inserted");
    });
}

async function IsInMongo(movieName) {

    let doc = await db.collection("films").find({ movieName: movieName }).toArray();

    if (doc.length == 0) {
        return false
    }

    return true
};

async function CheckParamsInMongo(id) {
    let doc = await db.collection("session").find({ id: id }).toArray();

    let necessaryFieldsToSend = new Array();
    let added = new Array();
    let notAdded = new Array();

    /*
     *  added и notAdded - массивы состояния заполнения полей в монго
     *  necessaryFieldsToSend - незаполненные поля, необходимые для минимальной сборки карточки фильма 
     */

    if (doc[0].film == undefined) {
        notAdded.push('фильм');
        necessaryFieldsToSend.push('фильм')
    } else {
        added.push('фильм');
    }

    if (doc[0].text == undefined) {
        notAdded.push('текст');
        necessaryFieldsToSend.push('текст')
    } else {
        added.push('текст');
    }

    if (doc[0].trailer == undefined) {
        notAdded.push('трейлер');
    } else {
        added.push('трейлер');
    }

    if (doc[0].photo == undefined) {
        notAdded.push('фото');
    } else {
        added.push('фото');
    }

    return { added: added, notAdded: notAdded, necessaryFieldsToSend: necessaryFieldsToSend }
}

function IsItAdmin(user_id) {
    for (let i = 0; i < importConfig.IDarr.length; i++) {
        if (user_id == importConfig.IDarr[i]) {
            return true;
        }
    }
    return false;
}

function IsNotButton(msgText) {
    let buttons = ["/start", "Добавить фильм", "Удалить фильм", "Вернуться в главное меню", "Отправить фильм на канал", "Отменить последний ввод"];

    if (buttons.includes(msgText)) {
        return false
    }

    return true;
}

function RemoveSessionFromMongo(id) {

    let myquery = { id: id }

    db.collection("session").deleteOne(myquery, function(err, obj) {
        if (err) throw err;
        console.log("Session removed");
    });

    sessionStack.splice(0, sessionStack.length);
}

async function RemoveLastParamFromMongo(id) {
    let doc = await db.collection("session").find({ id: id }).toArray();

    let lastOperation = sessionStack.pop();

    if (lastOperation == undefined) {
        bot.sendMessage(id, 'Невозможно удалить. Ничего ещё не введено', theFilmOpt);
        return
    }

    /*
     *Убираем последнее значение из стека и добавляем обратно в документ монго
     */

    if (lastOperation == 'film') {
        db.collection("session").update({ id: id }, { $unset: { film: doc[0].film } });
        bot.sendMessage(id, 'Удален последний ввод: фильм', theFilmOpt)
    } else if (lastOperation == 'text') {
        db.collection("session").update({ id: id }, { $unset: { text: doc[0].text } });
        db.collection("session").update({ id: id }, { $unset: { movieName: doc[0].movieName } });
        db.collection("session").update({ id: id }, { $unset: { categories: doc[0].categories } });
        bot.sendMessage(id, 'Удален последний ввод: текст', theFilmOpt)
    } else if (lastOperation == 'trailer') {
        db.collection("session").update({ id: id }, { $unset: { trailer: doc[0].trailer } });
        bot.sendMessage(id, 'Удален последний ввод: трейлер', theFilmOpt)
    } else if (lastOperation == 'photo') {
        db.collection("session").update({ id: id }, { $unset: { photo: doc[0].photo } });
        bot.sendMessage(id, 'Удален последний ввод: фото', theFilmOpt)
    }
}