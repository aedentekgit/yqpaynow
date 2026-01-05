import { useEffect } from 'react';

export const useCursor = () => {
  useEffect(() => {
    // Only apply cursor effect on desktop devices
    const isMobile = window.innerWidth <= 768;
    if (isMobile) return;

    // Create cursor elements
    const cursor = document.createElement('div');
    cursor.className = 'custom-cursor';
    document.body.appendChild(cursor);

    const cursorFollower = document.createElement('div');
    cursorFollower.className = 'custom-cursor-follower';
    document.body.appendChild(cursorFollower);

    // Create black sketch outline effect
    const sketchOutline = document.createElement('div');
    sketchOutline.className = 'sketch-outline';
    document.body.appendChild(sketchOutline);

    let mouseX = 0;
    let mouseY = 0;
    let followerX = 0;
    let followerY = 0;
    let sketchX = 0;
    let sketchY = 0;

    // Trail effect variables
    const trails = [];
    const maxTrails = 15;

    const moveCursor = (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      
      cursor.style.left = mouseX - 10 + 'px';
      cursor.style.top = mouseY - 10 + 'px';
      
      // Add active class when mouse moves
      cursor.classList.add('active');
      cursorFollower.classList.add('active');
      sketchOutline.classList.add('active');

      // Create sketch trail effect
      createSketchTrail(mouseX, mouseY);
    };

    const createSketchTrail = (x, y) => {
      // Limit the number of trails
      if (trails.length >= maxTrails) {
        const oldTrail = trails.shift();
        if (oldTrail && oldTrail.parentNode) {
          oldTrail.parentNode.removeChild(oldTrail);
        }
      }

      // Create new trail dot
      const trail = document.createElement('div');
      trail.className = 'sketch-trail';
      trail.style.left = x - 4 + 'px';
      trail.style.top = y - 4 + 'px';
      document.body.appendChild(trail);
      trails.push(trail);

      // Fade out the trail
      setTimeout(() => {
        trail.classList.add('fade-out');
        setTimeout(() => {
          if (trail && trail.parentNode) {
            trail.parentNode.removeChild(trail);
          }
        }, 500);
      }, 100);
    };

    const animateFollower = () => {
      const distX = mouseX - followerX;
      const distY = mouseY - followerY;
      
      followerX += distX * 0.1;
      followerY += distY * 0.1;
      
      cursorFollower.style.left = followerX - 20 + 'px';
      cursorFollower.style.top = followerY - 20 + 'px';

      // Animate sketch outline with more delay
      const sketchDistX = mouseX - sketchX;
      const sketchDistY = mouseY - sketchY;
      
      sketchX += sketchDistX * 0.05;
      sketchY += sketchDistY * 0.05;
      
      sketchOutline.style.left = sketchX - 30 + 'px';
      sketchOutline.style.top = sketchY - 30 + 'px';
      
      requestAnimationFrame(animateFollower);
    };

    // Different hover effects for different element types
    const handleButtonHover = () => {
      cursor.classList.add('button-hover');
      cursorFollower.classList.add('button-hover');
      sketchOutline.classList.add('hover');
    };

    const handleLinkHover = () => {
      cursor.classList.add('link-hover');
      cursorFollower.classList.add('link-hover');
      sketchOutline.classList.add('hover');
    };

    const handleGeneralHover = () => {
      cursor.classList.add('hover');
      cursorFollower.classList.add('hover');
      sketchOutline.classList.add('hover');
    };

    const handleMouseLeave = () => {
      cursor.classList.remove('hover', 'button-hover', 'link-hover');
      cursorFollower.classList.remove('hover', 'button-hover', 'link-hover');
      sketchOutline.classList.remove('hover');
    };

    const handleMouseDown = () => {
      cursor.classList.add('click');
      cursorFollower.classList.add('click');
      // Create burst effect on click
      for (let i = 0; i < 5; i++) {
        setTimeout(() => {
          createSketchTrail(
            mouseX + (Math.random() - 0.5) * 20,
            mouseY + (Math.random() - 0.5) * 20
          );
        }, i * 50);
      }
    };

    const handleMouseUp = () => {
      cursor.classList.remove('click');
      cursorFollower.classList.remove('click');
    };

    // Add event listeners
    document.addEventListener('mousemove', moveCursor);
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp);
    
    // Add hover effects to different types of interactive elements
    const buttons = document.querySelectorAll('button, .btn-primary, .btn-secondary, .demo-button');
    const links = document.querySelectorAll('a, .nav-links a');
    const interactiveCards = document.querySelectorAll('.workflow-step, .faq-item, .benefit-item, .menu-item');

    buttons.forEach(el => {
      el.addEventListener('mouseenter', handleButtonHover);
      el.addEventListener('mouseleave', handleMouseLeave);
    });

    links.forEach(el => {
      el.addEventListener('mouseenter', handleLinkHover);
      el.addEventListener('mouseleave', handleMouseLeave);
    });

    interactiveCards.forEach(el => {
      el.addEventListener('mouseenter', handleGeneralHover);
      el.addEventListener('mouseleave', handleMouseLeave);
    });

    animateFollower();

    return () => {
      document.removeEventListener('mousemove', moveCursor);
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseup', handleMouseUp);
      
      buttons.forEach(el => {
        el.removeEventListener('mouseenter', handleButtonHover);
        el.removeEventListener('mouseleave', handleMouseLeave);
      });

      links.forEach(el => {
        el.removeEventListener('mouseenter', handleLinkHover);
        el.removeEventListener('mouseleave', handleMouseLeave);
      });

      interactiveCards.forEach(el => {
        el.removeEventListener('mouseenter', handleGeneralHover);
        el.removeEventListener('mouseleave', handleMouseLeave);
      });

      // Clean up all trail elements
      trails.forEach(trail => {
        if (trail && trail.parentNode) {
          trail.parentNode.removeChild(trail);
        }
      });
      
      // Remove cursor elements
      if (cursor && cursor.parentNode) {
        cursor.parentNode.removeChild(cursor);
      }
      if (cursorFollower && cursorFollower.parentNode) {
        cursorFollower.parentNode.removeChild(cursorFollower);
      }
      if (sketchOutline && sketchOutline.parentNode) {
        sketchOutline.parentNode.removeChild(sketchOutline);
      }
    };
  }, []);
};