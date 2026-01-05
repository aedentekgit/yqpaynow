/**
 * Utility to fix SVG elements with invalid width/height="auto" attributes
 * This is a workaround for third-party libraries (like Razorpay) that set invalid SVG attributes
 */

export const fixSvgAttributes = () => {
  // Use MutationObserver to watch for SVG elements being added to the DOM
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) { // Element node
          // Check if the added node is an SVG
          if (node.tagName === 'svg') {
            fixSvgNode(node);
          }
          // Also check for SVG elements within the added node
          const svgElements = node.querySelectorAll?.('svg') || [];
          svgElements.forEach(fixSvgNode);
        }
      });
    });
  });

  // Start observing
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Also fix existing SVG elements on page load
  const fixExistingSvgs = () => {
    document.querySelectorAll('svg').forEach(fixSvgNode);
  };

  // Fix immediately and after a short delay (for dynamically loaded content)
  fixExistingSvgs();
  setTimeout(fixExistingSvgs, 100);
  setTimeout(fixExistingSvgs, 500);
  setTimeout(fixExistingSvgs, 1000);

  return () => observer.disconnect();
};

const fixSvgNode = (svg) => {
  if (!svg || svg.tagName !== 'svg') return;

  // Fix width attribute
  if (svg.hasAttribute('width')) {
    const width = svg.getAttribute('width');
    if (width === 'auto' || width === 'Auto' || width === 'AUTO') {
      // Remove invalid width, let CSS handle it, or set to 100% if viewBox exists
      if (svg.hasAttribute('viewBox')) {
        svg.setAttribute('width', '100%');
      } else {
        svg.removeAttribute('width');
      }
    }
  }

  // Fix height attribute
  if (svg.hasAttribute('height')) {
    const height = svg.getAttribute('height');
    if (height === 'auto' || height === 'Auto' || height === 'AUTO') {
      // Remove invalid height, let CSS handle it, or set to 100% if viewBox exists
      if (svg.hasAttribute('viewBox')) {
        svg.setAttribute('height', '100%');
      } else {
        svg.removeAttribute('height');
      }
    }
  }
};

