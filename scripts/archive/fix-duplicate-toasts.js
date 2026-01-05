const fs = require('fs');

const filesToFix = [
  {
    file: 'frontend-website/src/pages/QRCodeNameManagement.jsx',
    startLine: 442,
    entityName: 'QR Code Name'
  },
  {
    file: 'frontend-website/src/pages/RoleCreate.jsx',
    startLine: 462,
    entityName: 'Role'
  },
  {
    file: 'frontend-website/src/pages/RoleNameManagement.jsx',
    startLine: 462,
    entityName: 'Role'
  },
  {
    file: 'frontend-website/src/pages/theater/TheaterQRCodeNames.jsx',
    startLine: 323,
    entityName: 'QR Code Name'
  }
];

filesToFix.forEach(({file, startLine, entityName}) => {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  
  // Replace the 4 duplicate lines with conditional toast
  const lineIndex = startLine - 1; // Convert to 0-based index
  
  // Check if the pattern matches
  if (lines[lineIndex].includes('setShowCreateModal(false)') &&
      lines[lineIndex + 1].includes('toast.success') &&
      lines[lineIndex + 2].includes('setShowEditModal(false)') &&
      lines[lineIndex + 3].includes('toast.success')) {
    
    // Replace with conditional version
    lines[lineIndex] = '        if (isEditMode) {';
    lines[lineIndex + 1] = '          setShowEditModal(false);';
    lines[lineIndex + 2] = `          toast.success('${entityName} updated successfully!');`;
    lines[lineIndex + 3] = '        } else {';
    lines.splice(lineIndex + 4, 0, '          setShowCreateModal(false);');
    lines.splice(lineIndex + 5, 0, `          toast.success('${entityName} created successfully!');`);
    lines.splice(lineIndex + 6, 0, '        }');
    
    // Write back
    fs.writeFileSync(file, lines.join('\n'));
    console.log(`✅ Fixed ${file.split('/').pop()}`);
  } else {
    console.log(`⚠️  Pattern not found in ${file.split('/').pop()} at line ${startLine}`);
  }
});

console.log('\n✅ All files fixed!');
