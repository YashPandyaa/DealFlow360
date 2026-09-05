$file = $args[0]
$content = Get-Content $file
$content = $content -replace '^pick (.* feat: add fulfillment)', 'edit $1'
$content | Set-Content $file
