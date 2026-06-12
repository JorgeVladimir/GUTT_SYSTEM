async function test() {
  const API_BASE = 'http://localhost:8080/api';
  const testKey = 'test-key-123';
  const testPayload = {
    clave: testKey,
    modulo: 'CreditoAsesor',
    contenido: {
      pendingSteps: ['amortization', 'warranty'],
      lastSelectedSocio: '1720884012',
      customConfig: { rateMargin: 1.5 }
    },
    usuario: 'asesor-prueba'
  };

  console.log('\n🧪 TESTING ENGRAMS MEMORY API ENDPOINTS');
  console.log('===========================================\n');

  try {
    // 1. Post/Save the test engram
    console.log(`Sending POST /api/engrams for key "${testKey}"...`);
    const postRes = await fetch(`${API_BASE}/engrams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload)
    });
    
    if (!postRes.ok) {
      throw new Error(`POST request failed with status: ${postRes.status}`);
    }
    
    const postData = await postRes.json();
    console.log('POST Response:', postData);
    if (!postData.ok) {
      throw new Error(`POST operation failed: ${postData.error}`);
    }
    console.log('✅ POST /api/engrams successful.');

    // 2. Get the test engram
    console.log(`\nSending GET /api/engrams/${testKey}...`);
    const getRes = await fetch(`${API_BASE}/engrams/${testKey}`);
    if (!getRes.ok) {
      throw new Error(`GET request failed with status: ${getRes.status}`);
    }
    
    const getData = await getRes.json();
    console.log('GET Response Data:', JSON.stringify(getData.data, null, 2));
    if (!getData.ok || !getData.data) {
      throw new Error('GET operation failed to return the engram.');
    }
    
    if (getData.data.clave !== testKey || getData.data.modulo !== 'CreditoAsesor') {
      throw new Error('Retrieved engram keys/modules mismatch.');
    }
    
    if (getData.data.contenido.lastSelectedSocio !== '1720884012') {
      throw new Error('Retrieved engram content mismatch.');
    }
    console.log('✅ GET /api/engrams/:clave returned correct and parsed JSON content.');

    // 3. Update/Overwrite the test engram
    console.log(`\nSending POST /api/engrams to update key "${testKey}"...`);
    const updatedPayload = {
      ...testPayload,
      contenido: {
        ...testPayload.contenido,
        pendingSteps: ['signature'],
        completed: true
      }
    };
    
    const updateRes = await fetch(`${API_BASE}/engrams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedPayload)
    });
    
    if (!updateRes.ok) {
      throw new Error(`Update POST request failed with status: ${updateRes.status}`);
    }
    
    const updateData = await updateRes.json();
    console.log('Update POST Response:', updateData);
    console.log('✅ Update POST successful.');

    // 4. Verify the update
    console.log(`\nVerifying update with GET /api/engrams/${testKey}...`);
    const getVerifyRes = await fetch(`${API_BASE}/engrams/${testKey}`);
    const getVerifyData = await getVerifyRes.json();
    console.log('Updated GET Response Object:', JSON.stringify(getVerifyData, null, 2));
    
    if (getVerifyData.data.contenido.completed !== true) {
      throw new Error('Engram content was not updated correctly.');
    }
    console.log('✅ Engram updates verified successfully.');

    console.log('\n===========================================');
    console.log('🎉 ALL ENGRAMS API TESTS COMPLETED WITH 100% SUCCESS');
    console.log('===========================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ ERROR RUNNING ENGRAMS TESTS:', err.message);
    process.exit(1);
  }
}

test();
