import express from "express";
import crypto from "crypto";

const app = express();

const KEY_HEX =
"a8f2a1b5e9c470814f6b2c3a5d8e7f9c1a2b3c4d5e3f7a8b8cad1e2d0a4d5c5d";


function b64url(str) {
    return Buffer.from(
        str.replace(/-/g, "+").replace(/_/g, "/"),
        "base64"
    );
}


function decrypt(payload) {

    const [ivPart, cipherPart, tagPart] = payload.split(".");

    const iv = b64url(ivPart);
    const cipher = b64url(cipherPart);
    const tag = b64url(tagPart);

    const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        Buffer.from(KEY_HEX, "hex"),
        iv
    );

    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
        decipher.update(cipher),
        decipher.final()
    ]);

    return JSON.parse(decrypted.toString());
}


// Peachify API decryptor
app.get("/movie/:id", async (req, res) => {

    try {

        const response = await fetch(
            `https://usa.eat-peach.sbs/holly/movie/${req.params.id}`,
            {
                headers: {
                    Origin: "https://peachify.top",
                    Referer: "https://peachify.top/"
                }
            }
        );

        const body = await response.json();

        if (body.isEncrypted) {
            return res.json(decrypt(body.data));
        }

        res.json(body);

    } catch (err) {

        console.error(err);

        res.status(500).json({
            error: err.message
        });
    }
});


app.get("/proxy", async (req, res) => {
    try {
        const url = req.query.url;

        if (!url) {
            return res.status(400).send("Missing url");
        }

        let headers = {};

        if (req.query.headers) {
            headers = JSON.parse(req.query.headers);
        }

        const upstream = await fetch(url, {
            headers: {
                "User-Agent": headers["user-agent"] || "Mozilla/5.0",
                "Referer": headers["referer"] || "https://peachify.top/",
                "Origin": "https://peachify.top",
                ...(req.headers.range
                    ? { Range: req.headers.range }
                    : {})
            }
        });


        res.status(upstream.status);


        upstream.headers.forEach((value, key) => {
            res.setHeader(key, value);
        });


        res.setHeader(
            "Access-Control-Allow-Origin",
            "*"
        );


        if (upstream.body) {
            const reader = upstream.body.getReader();

            while (true) {
                const { done, value } = await reader.read();

                if (done) break;

                res.write(Buffer.from(value));
            }

            res.end();
        } else {
            res.end();
        }


    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});


app.listen(3000, () => {
    console.log("Running on http://localhost:3000");
});