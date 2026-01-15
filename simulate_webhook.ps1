$Url = "https://gmbhkvpcebnwnzygcedi.supabase.co/functions/v1/revenuecat-webhook"

# ⚠️ REPLACE WITH YOUR REAL USER ID (See Console Logs in App or Supabase Dashboard)
# If you don't know it, this test will just check if the Function is reachable (Status 200).
$UserId = "8d6ba346-5883-461b-b398-b189e5cb86b9" 

$Body = @{
    event = @{
        type = "NON_RENEWING_PURCHASE"
        product_id = "tokens_200"
        app_user_id = $UserId
        purchased_at_ms = (Get-Date).ToUniversalTime().ToFileTimeUtc()
    }
} | ConvertTo-Json

Write-Host "Sending simulated Webhook to: $Url"
try {
    $Response = Invoke-RestMethod -Uri $Url -Method Post -Body $Body -ContentType "application/json"
    Write-Host "✅ Success! Response:" -ForegroundColor Green
    $Response | Format-List
} catch {
    Write-Host "❌ Failed! Status Code: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    Write-Host "Error Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    Write-Host "`nIf you see a 404, it means the Function is NOT DEPLOYED." -ForegroundColor Yellow
    Write-Host "Run: npx supabase functions deploy revenuecat-webhook --no-verify-jwt" -ForegroundColor Cyan
}
