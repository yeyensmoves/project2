const { OAuth2Client } = require('google-auth-library');
const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');

const app = express();

const client = new OAuth2Client(
    '557287569123-rghvmdc9cpv1ii37v3d9qbe5hs9actn5.apps.googleusercontent.com'
);

app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'login_db',
    password: 'admin123',
    port: 5432,
});

app.post('/login', async (req, res) => {

    const username = req.body.username;
    const password = req.body.password;

    try {

        const result = await pool.query(
            `SELECT * FROM users
             WHERE username = $1
             AND password = crypt($2, password)`,
            [username, password]
        );

        if (result.rows.length > 0) {

            const user = result.rows[0];

            // CHECK ROLE
            if (user.role === 'admin') {

                return res.redirect('/admin.html');

            } else {

                return res.send(`
                <script>
                    sessionStorage.setItem("user", "${user.username}");
                    window.location.href = "/Menu.html";
                </script>
                `);

            }

        } else {

            return res.send(`
                <script>
                    alert('Invalid Username or Password');
                    window.location.href = '/index.html';
                </script>
            `);

        }

    } catch (err) {

        console.log(err);
        res.send('Database Error');

    }

});

app.post('/google-login', async (req, res) => {

    const token = req.body.token;

    try {

        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: '557287569123-rghvmdc9cpv1ii37v3d9qbe5hs9actn5.apps.googleusercontent.com',
        });

        const payload = ticket.getPayload();

        const email = payload.email;

        console.log("GOOGLE LOGIN:", email);

        // ADMIN EMAIL
        const adminEmail = "miguelyeyens07@gmail.com";

        let role = "user";

        if (email === adminEmail) {
            role = "admin";
        }

        // CHECK USER
        const userCheck = await pool.query(
            'SELECT * FROM users WHERE username = $1',
            [email]
        );

        // INSERT USER IF NOT EXISTS
        if (userCheck.rows.length === 0) {

            await pool.query(
                `INSERT INTO users (username, password, role)
                 VALUES ($1, crypt($2, gen_salt('bf')), $3)`,
                [email, 'google_account', role]
            );

        }

        // SUCCESS RESPONSE
        if (role === "admin") {

            res.json({
                success: true,
                role: "admin",
                email: email
            });

        } else {

            res.json({
                success: true,
                role: "user",
                email: email
            });

        }

    } catch (err) {

        console.log("GOOGLE ERROR:", err);

        res.status(500).json({
            success: false,
            message: "Google Authentication Failed"
        });

    }

});

app.post('/register', async (req, res) => {

    const username = req.body.username;
    const password = req.body.password;

    try {

        const checkUser = await pool.query(
            'SELECT * FROM users WHERE username = $1',
            [username]
        );

        if (checkUser.rows.length > 0) {
            return res.send(`
                <script>
                    alert('Username already exists');
                    window.location.href = '/register.html';
                </script>
            `);
        }

        // ENCRYPT PASSWORD
        await pool.query(
         "INSERT INTO users (username, password, role) VALUES ($1, crypt($2, gen_salt('bf')), 'user')",
         [username, password]
        );

        res.send(`
            <script>
                alert('Account created successfully');
                window.location.href = '/index.html';
            </script>
        `);

    } catch (err) {
        console.log(err);
        res.send('Database Error');
    }
});

app.post('/checkout', async (req, res) => {

    console.log("CHECKOUT HIT:", req.body);

    const { customer, items } = req.body;

    try {

        for (let item of items) {

            await pool.query(
            `INSERT INTO orders (customer, product, status)
            VALUES ($1, $2, 'Pending')`,
            [customer, `${item.name} | ₱${item.price}`]
        );

        }

        res.send("OK");

    } catch (err) {

        console.log("CHECKOUT ERROR:", err);
        res.status(500).send("ERROR");

    }

});

app.get('/orders', async (req, res) => {

    try {

        const result = await pool.query(
            "SELECT * FROM orders ORDER BY id DESC"
        );

        res.json(result.rows);

    } catch (err) {
        console.log(err);
        res.status(500).send("Error");
    }

});

app.delete('/orders/:id', async (req, res) => {

    const id = req.params.id;

    try {

        await pool.query(
            "DELETE FROM orders WHERE id = $1",
            [id]
        );

        res.send("OK");

    } catch (err) {
        console.log(err);
        res.status(500).send("ERROR");
    }

});

app.post('/orders/delete-multiple', async (req, res) => {

    const { ids } = req.body;

    try {

        await pool.query(
            "DELETE FROM orders WHERE id = ANY($1)",
            [ids]
        );

        res.send("OK");

    } catch (err) {
        console.log(err);
        res.status(500).send("ERROR");
    }

});

app.post('/orders/delivered', async (req, res) => {

    const { ids } = req.body;

    try {

        // 1. GET ORDERS
        const result = await pool.query(
            "SELECT * FROM orders WHERE id = ANY($1)",
            [ids]
        );

        const orders = result.rows;

        // 2. SAVE TO HISTORY (IMPORTANT PART)
        for (let order of orders) {

            await pool.query(
                `INSERT INTO order_history (customer, product, status)
                 VALUES ($1, $2, $3)`,
                [order.customer, order.product, "Delivered"]
            );
        }

        // 3. DELETE FROM ACTIVE ORDERS
        await pool.query(
            "DELETE FROM orders WHERE id = ANY($1)",
            [ids]
        );

        res.send("OK");

    } catch (err) {
        console.log("DELIVER ERROR:", err);
        res.status(500).send("ERROR");
    }

});

app.get('/history', async (req, res) => {

    try {

        const result = await pool.query(
            "SELECT * FROM order_history ORDER BY id DESC"
        );

        res.json(result.rows);

    } catch (err) {
        console.log("HISTORY ERROR:", err);
        res.status(500).send("ERROR");
    }

});

app.listen(3000, () => {
    console.log('Server Running');
});