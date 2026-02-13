# Test BullMQ Knowledge Indexing

Write-Host "🧪 Testing BullMQ Knowledge Indexing Implementation" -ForegroundColor Cyan
Write-Host ""

# Test 1: Small document
Write-Host "📝 Test 1: Small Document (< 1000 chars)" -ForegroundColor Yellow

$smallContent = "This is a small test document to verify BullMQ queue implementation. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante. Donec eu libero sit amet quam egestas semper. Aenean ultricies mi vitae est. Mauris placerat eleifend leo."

$body = @{
    tenantSlug = "test-tenant"
    title = "Small Test Document - BullMQ"
    category = "test"
    content = $smallContent
} | ConvertTo-Json

Write-Host "Sending POST request..." -ForegroundColor Gray

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3310/api/knowledge/documents" `
        -Method POST `
        -Headers @{"x-api-key"="klive-ai-dev-key"; "Content-Type"="application/json"} `
        -Body $body
    
    Write-Host "✅ Response received:" -ForegroundColor Green
    Write-Host "   Document ID: $($response.documentId)" -ForegroundColor White
    Write-Host "   Status: $($response.status)" -ForegroundColor White
    Write-Host "   Message: $($response.message)" -ForegroundColor White
    Write-Host ""
    
    Write-Host "🔍 Waiting 5 seconds for processing..." -ForegroundColor Gray
    Start-Sleep -Seconds 5
    
    Write-Host "📊 Checking Docker logs..." -ForegroundColor Gray
    docker logs klive-ai-klive-ai-1 --tail 20
    
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "✅ Test completed!" -ForegroundColor Green
