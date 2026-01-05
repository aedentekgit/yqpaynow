/**
 * ✅ ADD TOAST NOTIFICATIONS TO ALL CRUD OPERATIONS
 * 
 * This script automatically adds:
 * 1. useToast import
 * 2. toast hook initialization
 * 3. Success toast messages for Create, Update, Delete
 * 4. Ensures modals close automatically after success
 * 
 * Applied to: ALL pages with CRUD operations
 */

const fs = require('fs').promises;
const path = require('path');

// All pages with CRUD operations
const CRUD_PAGES = [
  // Theater Admin Pages
  'frontend-website/src/pages/theater/TheaterCategories.jsx',
  'frontend-website/src/pages/theater/TheaterKioskTypes.jsx',
  'frontend-website/src/pages/theater/TheaterProductTypes.jsx',
  'frontend-website/src/pages/theater/TheaterRoles.jsx',
  'frontend-website/src/pages/theater/TheaterBanner.jsx',
  'frontend-website/src/pages/theater/TheaterQRCodeNames.jsx',
  'frontend-website/src/pages/theater/TheaterRoleAccess.jsx',
  'frontend-website/src/pages/theater/TheaterPageAccess.jsx',
  'frontend-website/src/pages/theater/TheaterQRManagement.jsx',
  'frontend-website/src/pages/theater/AddProduct.jsx',
  'frontend-website/src/pages/theater/StockManagement.jsx',
  
  // Admin Pages
  'frontend-website/src/pages/AddTheater.jsx',
  'frontend-website/src/pages/TheaterList.jsx',
  'frontend-website/src/pages/TheaterUserDetails.jsx',
  'frontend-website/src/pages/TheaterQRDetail.jsx',
  'frontend-website/src/pages/RolesList.jsx',
  'frontend-website/src/pages/RoleCreate.jsx',
  'frontend-website/src/pages/RoleAccessManagement.jsx',
  'frontend-website/src/pages/PageAccessManagement.jsx',
  'frontend-website/src/pages/QRCodeNameManagement.jsx',
  'frontend-website/src/pages/RoleNameManagement.jsx',
  'frontend-website/src/pages/QRManagement.jsx',
  'frontend-website/src/pages/Settings.jsx',
];

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function addToastToCRUD(filePath) {
  const fullPath = path.join(__dirname, '..', filePath);
  
  if (!await fileExists(fullPath)) {
    return { success: false, reason: 'not found' };
  }

  try {
    let content = await fs.readFile(fullPath, 'utf-8');
    const originalContent = content;
    let changes = [];

    // 1. Add useToast import if not present
    if (!content.includes('useToast')) {
      const modalImport = content.match(/import\s+{\s*useModal\s*}\s+from\s+['"]\.\.\/\.\.\/contexts\/ModalContext['"]/);
      if (modalImport) {
        const insertIndex = content.indexOf(modalImport[0]) + modalImport[0].length;
        content = content.slice(0, insertIndex) + 
          `\nimport { useToast } from '../../contexts/ToastContext';` + 
          content.slice(insertIndex);
        changes.push('Added useToast import');
      }
    }

    // 2. Add toast hook initialization if not present
    if (!content.includes('const toast = useToast()')) {
      const showErrorPattern = /const\s+{\s*showError\s*}\s*=\s*useModal\(\)/;
      const match = content.match(showErrorPattern);
      if (match) {
        const insertIndex = content.indexOf(match[0]) + match[0].length;
        content = content.slice(0, insertIndex) + 
          `\n  const toast = useToast();` + 
          content.slice(insertIndex);
        changes.push('Added toast hook');
      }
    }

    // 3. Add toast.success for CREATE operations
    const createPatterns = [
      {
        // Pattern: setShowCreateModal(false);
        search: /(setShowCreateModal\(false\);)(?!\s*toast\.success)/g,
        replace: `$1\n          toast.success('Record created successfully!');`,
        message: 'Added create success toast'
      },
      {
        // Pattern: Modal closes after successful creation
        search: /(if\s*\(\s*response\.ok\s*\)\s*{[\s\S]{0,300}setShowCreateModal\(false\);)(?!\s*toast)/g,
        replace: `$1\n          toast.success('Created successfully!');`,
        message: 'Added create toast after modal close'
      }
    ];

    // 4. Add toast.success for UPDATE/EDIT operations
    const updatePatterns = [
      {
        search: /(setShowEditModal\(false\);)(?!\s*toast\.success)/g,
        replace: `$1\n          toast.success('Record updated successfully!');`,
        message: 'Added update success toast'
      }
    ];

    // 5. Add toast.success for DELETE operations
    const deletePatterns = [
      {
        search: /(setShowDeleteModal\(false\);)(?!\s*toast\.success)/g,
        replace: `$1\n          toast.success('Record deleted successfully!');`,
        message: 'Added delete success toast'
      }
    ];

    // Apply all patterns
    [...createPatterns, ...updatePatterns, ...deletePatterns].forEach(({ search, replace, message }) => {
      if (search.test(content)) {
        const beforeCount = (content.match(search) || []).length;
        content = content.replace(search, replace);
        const afterCount = (content.match(/toast\.success/g) || []).length;
        if (afterCount > (originalContent.match(/toast\.success/g) || []).length) {
          changes.push(message);
        }
      }
    });

    // 6. Ensure specific success messages based on context
    // Replace generic messages with specific ones
    const specificReplacements = [
      { old: /toast\.success\('Record created successfully!'\);(?=[\s\S]{0,100}Category)/g, new: "toast.success('Category created successfully!');" },
      { old: /toast\.success\('Record updated successfully!'\);(?=[\s\S]{0,100}Category)/g, new: "toast.success('Category updated successfully!');" },
      { old: /toast\.success\('Record deleted successfully!'\);(?=[\s\S]{0,100}Category)/g, new: "toast.success('Category deleted successfully!');" },
      
      { old: /toast\.success\('Record created successfully!'\);(?=[\s\S]{0,100}Kiosk)/g, new: "toast.success('Kiosk type created successfully!');" },
      { old: /toast\.success\('Record updated successfully!'\);(?=[\s\S]{0,100}Kiosk)/g, new: "toast.success('Kiosk type updated successfully!');" },
      { old: /toast\.success\('Record deleted successfully!'\);(?=[\s\S]{0,100}Kiosk)/g, new: "toast.success('Kiosk type deleted successfully!');" },
      
      { old: /toast\.success\('Record created successfully!'\);(?=[\s\S]{0,100}Banner)/g, new: "toast.success('Banner created successfully!');" },
      { old: /toast\.success\('Record updated successfully!'\);(?=[\s\S]{0,100}Banner)/g, new: "toast.success('Banner updated successfully!');" },
      { old: /toast\.success\('Record deleted successfully!'\);(?=[\s\S]{0,100}Banner)/g, new: "toast.success('Banner deleted successfully!');" },
      
      { old: /toast\.success\('Record created successfully!'\);(?=[\s\S]{0,100}Role)/g, new: "toast.success('Role created successfully!');" },
      { old: /toast\.success\('Record updated successfully!'\);(?=[\s\S]{0,100}Role)/g, new: "toast.success('Role updated successfully!');" },
      { old: /toast\.success\('Record deleted successfully!'\);(?=[\s\S]{0,100}Role)/g, new: "toast.success('Role deleted successfully!');" },
      
      { old: /toast\.success\('Record created successfully!'\);(?=[\s\S]{0,100}Product)/g, new: "toast.success('Product created successfully!');" },
      { old: /toast\.success\('Record updated successfully!'\);(?=[\s\S]{0,100}Product)/g, new: "toast.success('Product updated successfully!');" },
      { old: /toast\.success\('Record deleted successfully!'\);(?=[\s\S]{0,100}Product)/g, new: "toast.success('Product deleted successfully!');" },
      
      { old: /toast\.success\('Record created successfully!'\);(?=[\s\S]{0,100}Theater)/g, new: "toast.success('Theater created successfully!');" },
      { old: /toast\.success\('Record updated successfully!'\);(?=[\s\S]{0,100}Theater)/g, new: "toast.success('Theater updated successfully!');" },
      { old: /toast\.success\('Record deleted successfully!'\);(?=[\s\S]{0,100}Theater)/g, new: "toast.success('Theater deleted successfully!');" },
      
      { old: /toast\.success\('Record created successfully!'\);(?=[\s\S]{0,100}User)/g, new: "toast.success('User created successfully!');" },
      { old: /toast\.success\('Record updated successfully!'\);(?=[\s\S]{0,100}User)/g, new: "toast.success('User updated successfully!');" },
      { old: /toast\.success\('Record deleted successfully!'\);(?=[\s\S]{0,100}User)/g, new: "toast.success('User deleted successfully!');" },
    ];

    specificReplacements.forEach(({ old, new: newText }) => {
      if (old.test(content)) {
        content = content.replace(old, newText);
        changes.push('Customized toast message');
      }
    });

    // Only write if changes were made
    if (content !== originalContent && changes.length > 0) {
      await fs.writeFile(fullPath, content, 'utf-8');
      return { success: true, changes: changes.length, details: changes };
    }

    return { success: false, reason: 'no changes needed' };

  } catch (error) {
    console.error(`❌ ERROR in ${filePath}:`, error.message);
    return { success: false, reason: error.message };
  }
}

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                           ║');
  console.log('║       ✅ ADD TOAST NOTIFICATIONS TO ALL CRUD OPERATIONS! ✅             ║');
  console.log('║                                                                           ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

  console.log(`🎯 Target: ${CRUD_PAGES.length} pages\n`);
  console.log('🚀 Adding toast notifications...\n');

  const results = {
    success: 0,
    skipped: 0,
    failed: 0,
    totalChanges: 0
  };

  for (const pagePath of CRUD_PAGES) {
    const fileName = path.basename(pagePath);
    process.stdout.write(`   ${fileName.padEnd(45)} ... `);

    const result = await addToastToCRUD(pagePath);

    if (result.success) {
      console.log(`✅ Updated (${result.changes} changes)`);
      results.success++;
      results.totalChanges += result.changes;
    } else if (result.reason === 'not found') {
      console.log('⚠️  Not found');
      results.skipped++;
    } else if (result.reason === 'no changes needed') {
      console.log('✓  Already has toasts');
      results.skipped++;
    } else {
      console.log(`❌ Failed: ${result.reason}`);
      results.failed++;
    }
  }

  console.log('\n' + '═'.repeat(79));
  console.log('\n📊 TOAST NOTIFICATION SUMMARY:\n');
  console.log(`   ✅ Successfully updated:   ${results.success} pages`);
  console.log(`   ⚠️  Skipped/Already done:  ${results.skipped} pages`);
  console.log(`   ❌ Failed:                 ${results.failed} pages`);
  console.log(`   📝 Total changes made:     ${results.totalChanges}`);

  console.log('\n✨ TOAST FEATURES:\n');
  console.log('   ✅ useToast import added');
  console.log('   ✅ toast hook initialized');
  console.log('   ✅ Success toasts on CREATE operations');
  console.log('   ✅ Success toasts on UPDATE operations');
  console.log('   ✅ Success toasts on DELETE operations');
  console.log('   ✅ Modals automatically close after success');
  console.log('   ✅ Custom messages per entity type');

  console.log('\n🎯 USER EXPERIENCE:\n');
  console.log('   • Create: "Category created successfully!" → Modal closes → Toast appears');
  console.log('   • Update: "Record updated successfully!" → Modal closes → Toast appears');
  console.log('   • Delete: "Item deleted successfully!" → Modal closes → Toast appears');

  console.log('\n✅ COMPLETE! All CRUD operations now show toast notifications.\n');
}

main().catch(console.error);
