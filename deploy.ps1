# 推送念枢星图到 GitHub 并提示 Pages 地址
# 若 push 失败，请先开 VPN/代理，或执行: gh auth login

Set-Location $PSScriptRoot

Write-Host ">>> 推送到 https://github.com/Ccwevelyn/Dream.git ..." -ForegroundColor Cyan
git push -u origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "`n推送失败。常见原因：网络无法访问 GitHub。" -ForegroundColor Red
    Write-Host "请开 VPN 后重试，或在浏览器登录 GitHub 后手动上传文件。" -ForegroundColor Yellow
    exit 1
}

Write-Host "`n>>> 推送成功！" -ForegroundColor Green
Write-Host "网页地址（需先在 GitHub 开启 Pages）：" -ForegroundColor Cyan
Write-Host "  https://ccwevelyn.github.io/Dream/" -ForegroundColor White
Write-Host "`n开启 GitHub Pages 步骤：" -ForegroundColor Cyan
Write-Host "  1. 打开 https://github.com/Ccwevelyn/Dream/settings/pages"
Write-Host "  2. Build and deployment → Source 选 Deploy from a branch"
Write-Host "  3. Branch 选 main，文件夹选 / (root)，点 Save"
Write-Host "  4. 等 1～2 分钟后访问上面的网址"
