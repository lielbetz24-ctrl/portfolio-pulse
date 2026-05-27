# PortfolioPulse — Portfolio Tracking Platform

אפליקציית מעקב תיקי השקעות ללקוחות ויועצים, עם סנכרון שערי שוק בזמן אמת.

## הרצה מקומית

```bash
cd portfolio-app
npm install
npm start
```

פתח בדפדפן: **http://localhost:3000**

## התחברות מנהל (ברירת מחדל)

| שדה | ערך |
|-----|-----|
| אימייל | `aviariel91@gmail.com` |
| סיסמה | `AVIm76543` |

## מבנה

- `server/` — Express API + SQLite
- `public/` — ממשק משתמש (HTML/CSS/JS)
- `data/` — בסיס נתונים (נוצר אוטומטית)

## API עיקרי

- `POST /api/auth/login` — התחברות
- `POST /api/auth/register` — הרשמה
- `GET /api/sync` — תיקים, עסקאות, טיפים
- `POST /api/transactions` — תיעוד עסקה
- `GET /api/market/prices` — שערי שוק (Yahoo Finance)
