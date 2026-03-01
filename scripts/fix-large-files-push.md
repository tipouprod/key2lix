# إزالة الملفات الكبيرة من Git ثم الرفع

نفّذ الأوامر من مجلد المشروع (مثل `c:\Users\TIPOU\Desktop\keylix`) في **PowerShell** أو **Git Bash**.

## 1) إزالة الملفات الكبيرة من كل التاريخ

```bash
git filter-branch --force --index-filter "git rm --cached --ignore-unmatch client/assets/img/CursorUserSetup-x64-2.4.35.exe public/img/Git-2.53.0-64-bit.exe" --prune-empty -- --all
```

إن ظهر تحذير عن `refs/original` يمكن تجاهله.

## 2) حذف النسخة الاحتياطية من الـ refs (اختياري)

```bash
rmdir /s /q .git\refs\original 2>nul
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

(في Git Bash استخدم: `rm -rf .git/refs/original`)

## 3) إضافة تحديث .gitignore وتثبيته

```bash
git add .gitignore
git commit -m "Ignore exe files" --allow-empty
```

## 4) رفع التغييرات (بعد إعادة كتابة التاريخ)

```bash
git push origin main --force
```

بعد ذلك يجب أن يقبل GitHub الـ push. إذا ظهرت أي رسالة خطأ أخرى (ملف كبير جديد)، أضف مساره في الأمر في الخطوة 1 ثم أعد من الخطوة 1.
