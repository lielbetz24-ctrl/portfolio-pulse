# UTF-8 Encoding
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "🚀 PortfolioPulse AI - GitHub Deployment Automation" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "שלום! כלי זה יכין ויעלה את האפליקציה לחשבון ה-GitHub שלך" -ForegroundColor Yellow
Write-Host "כדי שנוכל לחבר אותה לשרת ענן קבוע (Render) בחינם!" -ForegroundColor Yellow
Write-Host ""

# 1. Check if Git is installed
$gitCheck = Get-Command git -ErrorAction SilentlyContinue
if (-not $gitCheck) {
    Write-Host "🔍 בודק התקנת Git במערכת..." -ForegroundColor Yellow
    Write-Host "Git לא נמצא במערכת. מתחיל התקנה אוטומטית ושקטה של Git..." -ForegroundColor Cyan
    
    # Run winget to install Git
    Start-Process winget -ArgumentList "install --id Git.Git -e --source winget --silent --accept-package-agreements --accept-source-agreements" -NoNewWindow -Wait
    
    # Verify installation
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    $gitCheck = Get-Command git -ErrorAction SilentlyContinue
    
    if (-not $gitCheck) {
        Write-Host "❌ ההתקנה האוטומטית נכשלה או דורשת הפעלה מחדש של הטרמינל." -ForegroundColor Red
        Write-Host "אנא הורד והתקן את Git ידנית מכאן: https://git-scm.com/download/win" -ForegroundColor LightRed
        Write-Host "לאחר מכן הרץ את הסקריפט מחדש." -ForegroundColor LightRed
        Read-Host "לחץ Enter ליציאה..."
        exit
    }
    Write-Host "✅ Git הותקן בהצלחה במערכת!" -ForegroundColor Green
} else {
    Write-Host "✅ Git מזוהה ותקין במערכת." -ForegroundColor Green
}

# 2. Ask for GitHub repository URL
Write-Host ""
Write-Host "אנא בצע את הפעולות הבאות בדפדפן:" -ForegroundColor Yellow
Write-Host "1. כנס ל-github.com והתחבר למשתמש שלך (liel.be.tz24@gmail.com)." -ForegroundColor White
Write-Host "2. לחץ על כפתור 'New' (ירוק) ליצירת רפוזיטורי (Repository) חדש." -ForegroundColor White
Write-Host "3. תן לו את השם: portfolio-pulse" -ForegroundColor White
Write-Host "4. השאר אותו כ-Public או Private ולחץ על 'Create repository'." -ForegroundColor White
Write-Host "5. העתק את הקישור שקיבלת (למשל: https://github.com/username/portfolio-pulse.git)." -ForegroundColor White
Write-Host ""

$repoUrl = Read-Host "אנא הדבק כאן את קישור הרפוזיטורי שלך מ-GitHub"
$repoUrl = $repoUrl.Trim()

if (-not $repoUrl.StartsWith("https://github.com/")) {
    Write-Host "❌ הקישור שהזנת אינו קישור תקין של GitHub!" -ForegroundColor Red
    Read-Host "לחץ Enter ליציאה..."
    exit
}

Write-Host ""
Write-Host "⚙️ מאתחל מאגר Git ומכין את הקבצים להעלאה..." -ForegroundColor Yellow

# Configure dummy git email/name if not set (crucial fix for fresh Git installs!)
$gitEmail = git config --global user.email
if (-not $gitEmail) {
    git config --global user.email "liel.be.tz24@gmail.com"
}
$gitName = git config --global user.name
if (-not $gitName) {
    git config --global user.name "Liel"
}

# Initialize repository if not already initialized
if (-not (Test-Path ".git")) {
    git init
    git branch -M main
}

# Add files
git add .

# Commit
git commit -m "Initial commit of PortfolioPulse with caching and PWA enhancements"

# Add remote
git remote remove origin 2>$null
git remote add origin $repoUrl

Write-Host ""
Write-Host "🚀 מעלה את הקוד ל-GitHub..." -ForegroundColor Cyan
Write-Host "שים לב: ייפתח לך חלון דפדפן קופץ של GitHub המבקש ממך לאשר את החיבור (Sign in with your browser)." -ForegroundColor Yellow
Write-Host "נא לאשר אותו כדי לאפשר את העלאת הקוד בצורה בטוחה!" -ForegroundColor Yellow
Write-Host ""

# Push to GitHub
git push -u origin main --force

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "🎉 מזל טוב! הקוד עלה בהצלחה ל-GitHub!" -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "כעת תוכל לחבר אותו ל-Render.com ב-3 קליקים פשוטים:" -ForegroundColor Yellow
    Write-Host "1. כנס ל-dashboard.render.com והתחבר באמצעות כפתור ה-GitHub שלך." -ForegroundColor White
    Write-Host "2. לחץ על 'New +' ובחר 'Web Service'." -ForegroundColor White
    Write-Host "3. תחת 'Connect a repository', בחר ברפוזיטורי 'portfolio-pulse' שיצרנו כרגע." -ForegroundColor White
    Write-Host "4. בהגדרות השרת, תן שם לשרת שלך, ודא שהגדרות ההפעלה הן:" -ForegroundColor White
    Write-Host "   - Runtime: Node" -ForegroundColor LightCyan
    Write-Host "   - Build Command: npm install (או להשאיר ריק)" -ForegroundColor LightCyan
    Write-Host "   - Start Command: npm start" -ForegroundColor LightCyan
    Write-Host "5. לחץ על 'Deploy Web Service' והשרת שלך יהיה באוויר 24/7 באופן קבוע ומאובטח!" -ForegroundColor White
    Write-Host ""
    Write-Host "ברגע שזה יסתיים, Render יתנו לך כתובת קבועה. שלח לי אותה ואני אקמפל לך" -ForegroundColor Yellow
    Write-Host "את קובץ ה-APK הסופי לטלפון שמחובר לצמיתות לענן!" -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "❌ ההעלאה נכשלה. אנא ודא שהתחברת בהצלחה לחלון ה-GitHub שקפץ ושהקישור תקין." -ForegroundColor Red
}

Write-Host ""
Read-Host "לחץ Enter ליציאה..."
