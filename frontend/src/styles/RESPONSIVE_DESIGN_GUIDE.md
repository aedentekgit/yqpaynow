# Responsive Design System Guide

This document explains the comprehensive responsive design system implemented across the entire project.

## Overview

The project uses a **mobile-first responsive design approach** with **global design consistency**. All pages automatically benefit from a three-tier responsive CSS architecture:

1. **Global Responsive Utilities** (`responsive-global.css`)
2. **Component Responsive Styles** (`components-responsive.css`)  
3. **Page-Specific Responsive Utilities** (`pages-responsive.css`)

## Architecture

```
index.css (main entry point)
├── responsive-global.css       (Foundation: Typography, layouts, utilities)
├── components-responsive.css   (Shared components: Sidebar, Header, Modal, etc.)
└── pages-responsive.css        (Page patterns: Tables, grids, filters, etc.)
```

## Breakpoints

The system uses standard breakpoints across all CSS files:

| Breakpoint | Width | Device Type |
|------------|-------|-------------|
| **Mobile** | < 640px | Small mobile phones |
| **Tablet** | 640px - 1024px | Tablets and large phones |
| **Desktop** | > 1024px | Desktops and laptops |

### Additional Breakpoints

- **Large Tablet**: 768px - 1024px
- **Small Mobile**: < 480px
- **Extra Small**: < 360px
- **Landscape Mode**: `max-height: 500px` and `orientation: landscape`

## CSS Variables

All responsive styles use CSS variables defined in the root:

```css
:root {
  /* Spacing */
  --mobile-padding: 12px;
  --tablet-padding: 20px;
  --desktop-padding: 24px;
  
  /* Font Sizes */
  --mobile-h1: 20px;
  --tablet-h1: 26px;
  --desktop-h1: 32px;
  
  /* Touch Targets */
  --min-touch-target: 44px; /* iOS/Android standard */
  
  /* Safe Area Insets (for notched devices) */
  --safe-area-top: env(safe-area-inset-top, 0px);
  --safe-area-bottom: env(safe-area-inset-bottom, 0px);
  --safe-area-left: env(safe-area-inset-left, 0px);
  --safe-area-right: env(safe-area-inset-right, 0px);
}
```

## File Descriptions

### 1. responsive-global.css

**Purpose**: Foundation responsive utilities for the entire application

**Contains**:
- Responsive containers (`.responsive-container`)
- Typography scaling (h1, h2, h3, p, etc.)
- Button sizing (minimum touch targets)
- Form input sizing
- Grid layouts (`.responsive-grid`, `.responsive-grid-4`)
- Flex layouts (`.responsive-flex`)
- Responsive spacing utilities
- Responsive tables (`.responsive-table`)
- Responsive modals (`.responsive-modal`)
- Navigation patterns (`.responsive-nav`)
- Image handling (`.responsive-img`, `.responsive-img-cover`)
- Scrolling patterns (`.responsive-scroll-x`)
- Visibility utilities (`.mobile-only`, `.desktop-only`, `.hide-mobile`)
- Safe area support (`.safe-area-top`, `.safe-area-bottom`)
- Touch optimizations
- Performance optimizations

### 2. components-responsive.css

**Purpose**: Responsive styles for shared components used across pages

**Contains**:
- Sidebar (`.sidebar` - collapsible on mobile)
- Header (`.header` - stacked on mobile)
- Modal (`.modal` - full screen on mobile)
- Buttons (`.btn` - larger touch targets on mobile)
- Form inputs (16px font to prevent iOS zoom)
- Cards (`.card` - adjusted padding)
- Pagination (`.pagination` - wrapped on mobile)
- Image upload (`.image-upload-container`)
- Toast notifications (`.toast`)
- Loading spinners (`.spinner`)
- Dropdown menus (`.dropdown-menu`)
- Alert components (`.alert`)
- Landscape orientation fixes

### 3. pages-responsive.css

**Purpose**: Responsive patterns for common page elements

**Contains**:
- Page containers & wrappers
- Page headers (`.page-header`)
- Filter controls (`.filter-controls`)
- Data tables (`.data-table-container`, `.theater-table-container`)
- Action buttons (`.action-buttons`)
- Grid layouts (`.grid-4`, `.grid-3`, `.grid-2`)
- Stats & metrics cards (`.stats-grid`, `.metric-card`)
- Charts & visualizations (`.chart-card`)
- Product cards & listings (`.product-grid`)
- Category tabs (`.category-tabs`)
- Search bars (`.search-bar`)
- Pagination (`.pagination-container`)
- Image thumbnails (`.theater-photo-thumb`)
- Status badges (`.status-badge`)
- Icons (`.svg-icon-lg`, `.svg-icon-md`, `.svg-icon-sm`)
- Theater POS interface (`.pos-layout`)
- Customer pages specific (`.customer-header`, `.floating-cart-btn`)
- Empty states (`.empty-state`)
- Loading states (`.loading-container`)
- Utility classes (`.mobile-full-width`, `.mobile-stack`, `.mobile-center`)
- Landscape mode optimizations
- Print styles

## Usage Guidelines

### For New Pages

When creating a new page, you **don't need to write responsive styles** if you:

1. **Use standard class names** that are already covered:
   - `.page-header`, `.page-title`, `.page-subtitle`
   - `.filter-controls`, `.filter-group`
   - `.data-table-container`, `.theater-table`
   - `.product-grid`, `.stats-grid`
   - `.btn`, `.card`, `.modal`

2. **Follow the existing patterns**:
   ```jsx
   <div className="page-wrapper">
     <div className="page-header">
       <h1 className="page-title">My Page</h1>
       <div className="page-header-actions">
         <button className="btn">Action</button>
       </div>
     </div>
     <div className="stats-grid">
       {/* Stats cards */}
     </div>
   </div>
   ```

3. **Use responsive utility classes**:
   - `.mobile-only` - Show only on mobile
   - `.desktop-only` - Show only on desktop
   - `.mobile-full-width` - Full width on mobile
   - `.mobile-stack` - Stack vertically on mobile
   - `.mobile-center` - Center on mobile
   - `.hide-mobile` - Hide on mobile
   - `.hide-tablet` - Hide on tablet
   - `.hide-desktop` - Hide on desktop

### When to Add Custom Responsive Styles

Only add custom page-specific responsive styles if your page has:

1. **Unique layouts** not covered by the global patterns
2. **Custom component spacing** requirements
3. **Special mobile interactions** or gestures
4. **Page-specific breakpoints** needs

### Example: Adding Custom Responsive Styles

If you need custom responsive styles, add them to your page's CSS file:

```css
/* MyPage.css */

/* Desktop styles (default) */
.my-custom-layout {
  display: grid;
  grid-template-columns: 300px 1fr 300px;
  gap: 24px;
}

/* Tablet */
@media (max-width: 1024px) {
  .my-custom-layout {
    grid-template-columns: 250px 1fr;
    gap: 20px;
  }
}

/* Mobile */
@media (max-width: 768px) {
  .my-custom-layout {
    grid-template-columns: 1fr;
    gap: 16px;
  }
}
```

## Best Practices

### 1. Mobile-First Approach

Write base styles for mobile, then add media queries for larger screens:

```css
/* Mobile (default) */
.element {
  width: 100%;
  padding: 12px;
}

/* Tablet and up */
@media (min-width: 640px) {
  .element {
    width: 50%;
    padding: 20px;
  }
}
```

### 2. Touch Targets

Always ensure interactive elements are at least 44px × 44px on mobile:

```css
@media (max-width: 768px) {
  button, .btn {
    min-height: 44px;
    min-width: 44px;
    padding: 12px 20px;
  }
}
```

### 3. Typography Scaling

Use relative font sizes that scale with viewport:

```css
h1 { font-size: var(--mobile-h1); }

@media (min-width: 640px) {
  h1 { font-size: var(--tablet-h1); }
}

@media (min-width: 1024px) {
  h1 { font-size: var(--desktop-h1); }
}
```

### 4. Prevent iOS Zoom

Set input font-size to minimum 16px on mobile to prevent auto-zoom:

```css
@media (max-width: 639px) {
  input, textarea, select {
    font-size: 16px !important;
  }
}
```

### 5. Safe Area Insets

Always account for device notches and rounded corners:

```css
.header {
  padding-top: calc(16px + env(safe-area-inset-top));
}

.footer {
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
}
```

### 6. Scrollable Tables

Wrap tables in a scrollable container on mobile:

```css
.table-container {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.table {
  min-width: 700px; /* Ensure table doesn't break */
}
```

### 7. Stack on Mobile

Convert horizontal layouts to vertical on mobile:

```css
.layout {
  display: flex;
  gap: 24px;
}

@media (max-width: 768px) {
  .layout {
    flex-direction: column;
    gap: 16px;
  }
}
```

## Testing Responsive Design

### Browser DevTools

1. Open Chrome/Firefox DevTools (F12)
2. Click "Toggle Device Toolbar" (Ctrl+Shift+M)
3. Test these devices:
   - iPhone SE (375px × 667px)
   - iPhone 12 Pro (390px × 844px)
   - iPad Mini (768px × 1024px)
   - iPad Pro (1024px × 1366px)

### Real Devices

Always test on actual devices:
- Small mobile (< 375px width)
- Standard mobile (375px - 414px)
- Tablet (768px - 1024px)
- Desktop (> 1024px)

### Key Testing Points

✅ All text is readable (minimum 14px on mobile)
✅ All buttons are easily tappable (minimum 44px × 44px)
✅ No horizontal scrolling (except tables)
✅ Images scale properly
✅ Modals are accessible
✅ Forms are easy to fill
✅ Navigation is intuitive
✅ Safe areas are respected (notched devices)

## Common Issues & Solutions

### Issue: Text Too Small on Mobile
**Solution**: Use responsive typography variables
```css
font-size: var(--mobile-body);
```

### Issue: Buttons Too Small to Tap
**Solution**: Set minimum touch target
```css
@media (max-width: 768px) {
  button {
    min-height: 44px;
    min-width: 44px;
  }
}
```

### Issue: Horizontal Scrolling
**Solution**: Use responsive containers
```css
.container {
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
}
```

### Issue: iOS Auto-Zoom on Input Focus
**Solution**: Set input font-size to 16px
```css
@media (max-width: 639px) {
  input {
    font-size: 16px !important;
  }
}
```

### Issue: White Gaps on iPhone Notch
**Solution**: Use safe area insets
```css
padding-top: calc(16px + env(safe-area-inset-top));
```

### Issue: Modal Not Accessible on Mobile
**Solution**: Use responsive modal pattern
```css
@media (max-width: 768px) {
  .modal {
    width: 100%;
    max-height: 90vh;
    border-radius: 20px 20px 0 0;
  }
}
```

## Page-Specific Documentation

### Dashboard Pages
- Uses `.sadmin-top-stats` for metrics
- Responsive grid: 4 cols → 2 cols → 1 col
- Charts scale down on mobile

### Theater Pages
- Tables use `.theater-table-container` for horizontal scroll
- POS interface: Side-by-side → Stacked on mobile
- Product grids: 4 cols → 3 cols → 2 cols → 1 col

### Customer Pages
- Uses `.customer-header` for purple gradient header
- Products grid: 3 cols → 2 cols → 1 col
- Floating cart button: Fixed position, safe-area aware
- Bottom navigation: Fixed with safe-area padding

### Admin Pages
- Uses standard `.page-header` pattern
- Forms stack vertically on mobile
- Action buttons full-width on mobile

## Maintenance

### Adding New Global Patterns

If you find a pattern repeated across multiple pages:

1. Add it to `pages-responsive.css`
2. Use semantic class names (e.g., `.pattern-name`)
3. Document it in this guide
4. Update existing pages to use the new pattern

### Performance Considerations

- Use CSS transforms for animations (GPU accelerated)
- Minimize media query nesting
- Leverage CSS variables for consistency
- Use `will-change` sparingly

### Accessibility

- Maintain color contrast ratios (WCAG AA: 4.5:1)
- Support keyboard navigation
- Provide `aria-labels` for icon-only buttons
- Test with screen readers
- Support reduced motion preferences

## Resources

- [MDN: Using Media Queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Media_Queries/Using_media_queries)
- [CSS Tricks: A Complete Guide to Flexbox](https://css-tricks.com/snippets/css/a-guide-to-flexbox/)
- [CSS Tricks: A Complete Guide to Grid](https://css-tricks.com/snippets/css/complete-guide-grid/)
- [Apple: Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)
- [Material Design: Layout](https://material.io/design/layout/)

## Support

For questions or issues with responsive design:
1. Check this guide first
2. Review the three responsive CSS files
3. Look at similar existing pages for patterns
4. Create a new pattern if truly unique

---

**Last Updated**: December 2025  
**Maintained By**: Development Team

