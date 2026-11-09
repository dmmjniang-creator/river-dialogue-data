# 记忆备份
# 功能：把房间里的记忆库打成一个带时间戳的 zip，放到备份目录，只留最近 N 份。
# 为什么：手动打会忘（11-08 凌晨那份 zip 打完就没再更新）；数据坏了代价太大，备份得是顺手的事，不是记得才做的事。
# 用法：pwsh -File 记忆备份.ps1 [-Keep 7] [-Dest "E:\记忆库备份"] [-Src "路径\记忆库"]
# 边界：只读记忆库，只写 Dest；不改库、不碰 git；校验失败时退出码 1（当巡检用）。
# 路径：Src / Dest 都能从参数改；Src 缺省按「脚本所在目录的上一级 \ 记忆库」推，换机器不用改代码。
# 最后改：2026-11-09（$Src 去掉硬编码的绝对路径，改成按脚本位置相对推导）

param(
  [int]$Keep = 7,
  [string]$Dest = 'E:\你的备份目录',
  [string]$Src = ''
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

# 没给 Src 就按脚本位置推：工具\ 的上一级是房间，房间里就是记忆库
if ([string]::IsNullOrWhiteSpace($Src)) {
  $Src = Join-Path (Split-Path -Parent $PSScriptRoot) '记忆库'
}

if (-not (Test-Path -LiteralPath $Src)) { Write-Error "找不到记忆库：$Src"; exit 1 }
New-Item -ItemType Directory -Path $Dest -Force | Out-Null

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
# 2026-11-08：记忆库和工具各放一个子目录，跟档案并排
$记忆库目录 = Join-Path $Dest '记忆库'
$工具目录 = Join-Path $Dest '工具'
New-Item -ItemType Directory -Path $记忆库目录 -Force | Out-Null
New-Item -ItemType Directory -Path $工具目录 -Force | Out-Null
$zip = Join-Path $记忆库目录 "记忆库-$stamp.zip"
if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }

# 带上根目录名（记忆库\…），恢复时整目录解压回去就行
[System.IO.Compression.ZipFile]::CreateFromDirectory(
  $Src, $zip, [System.IO.Compression.CompressionLevel]::Optimal, $true)

# 校验：条目数 + 抽三个关键文件比对内容
$z = [System.IO.Compression.ZipFile]::OpenRead($zip)
$count = $z.Entries.Count
$probe = @('记忆库/002 目录.md', '记忆库/底账/记忆不忘.md', '记忆库/.git/HEAD')
$bad = @()
foreach ($p in $probe) {
  $e = $z.Entries | Where-Object { ($_.FullName -replace '\\', '/') -eq $p } | Select-Object -First 1
  if (-not $e) { $bad += "$p（zip 里没有）"; continue }
  $reader = New-Object System.IO.StreamReader($e.Open())
  $inZip = $reader.ReadToEnd(); $reader.Close()
  $onDisk = [System.IO.File]::ReadAllText((Join-Path $Src ($p -replace '^记忆库/', '')), [System.Text.Encoding]::UTF8)
  if ($inZip -ne $onDisk) { $bad += "$p（内容和磁盘不一致）" }
}
$z.Dispose()

if ($bad.Count) {
  Write-Host "备份写出来了，但校验不过：$zip"
  $bad | ForEach-Object { Write-Host "  ✗ $_" }
  exit 1
}

# 只留最近 N 份
$old = Get-ChildItem $记忆库目录 -Filter '记忆库-*.zip' | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Keep
foreach ($f in $old) { Remove-Item -LiteralPath $f.FullName -Force }
$oldTools = Get-ChildItem $工具目录 -Filter '工具-*.zip' | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Keep
foreach ($f in $oldTools) { Remove-Item -LiteralPath $f.FullName -Force }

# 工具目录也留一份：脚本坏了比 md 更难捞，而且它只有 0.1 MB
$toolsSrc = Join-Path (Split-Path $Src -Parent) '工具'
$toolsZip = $null
if (Test-Path -LiteralPath $toolsSrc) {
  $toolsZip = Join-Path $工具目录 "工具-$stamp.zip"
  if (Test-Path -LiteralPath $toolsZip) { Remove-Item -LiteralPath $toolsZip -Force }
  [System.IO.Compression.ZipFile]::CreateFromDirectory(
    $toolsSrc, $toolsZip, [System.IO.Compression.CompressionLevel]::Optimal, $true)
  "工具 ：{0}  {1:N0} KB" -f $toolsZip, ((Get-Item $toolsZip).Length / 1KB)
}

"{0}  {1:N1} MB  {2} 个条目  保留最近 {3} 份" -f $zip, ((Get-Item $zip).Length / 1MB), $count, $Keep
if ($old.Count) { "清掉旧的 $($old.Count) 份" }

# 顺手刷新库外那份档案，别让它比库旧。失败不影响备份本身。
# 2026-11-08：档案不再上锁（只读 + 目录 deny 在 Obsidian 里添乱），所以这里也不用解锁/锁回。
try {
  $档案 = Join-Path $PSScriptRoot '记忆档案.mjs'
  if (Test-Path -LiteralPath $档案) { & node $档案 | Out-Host }
  $规范 = Join-Path $PSScriptRoot '导出规范.ps1'
  if (Test-Path -LiteralPath $规范) { & $规范 | Out-Host }
} catch { Write-Host "档案没刷新：$($_.Exception.Message)" }

# 档案目录不再单独打包（2026-11-08 他定的：档案靠他自己注意 + Obsidian 文件恢复，不另做途径）

exit 0
