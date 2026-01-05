const fs = require('fs');

const files = [
  'frontend-website/src/pages/QRCodeNameManagement.jsx',
  'frontend-website/src/pages/RoleCreate.jsx',
  'frontend-website/src/pages/RoleNameManagement.jsx',
  'frontend-website/src/pages/theater/TheaterQRCodeNames.jsx'
];

files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  const lines = content.split('\n');
  let foundDup = false;
  
  for(let i = 0; i < lines.length - 3; i++) {
    if (lines[i].includes('setShowCreateModal(false)') && 
        lines[i+1].includes('toast.success') && 
        lines[i+2].includes('setShowEditModal(false)') && 
        lines[i+3].includes('toast.success')) {
      console.log(`\n❌ ${f.split('/').pop()}:`);
      console.log(`Line ${i+1}: ${lines[i].trim()}`);
      console.log(`Line ${i+2}: ${lines[i+1].trim()}`);
      console.log(`Line ${i+3}: ${lines[i+2].trim()}`);
      console.log(`Line ${i+4}: ${lines[i+3].trim()}`);
      foundDup = true;
      break;
    }
  }
  
  if(!foundDup) console.log(`✅ ${f.split('/').pop()} - No duplicate found`);
});
