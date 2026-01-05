import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ActionButton from './ActionButton';

describe('ActionButton Component', () => {
    it('renders with default props', () => {
        render(<ActionButton onClick={() => { }} />);
        const button = screen.getByRole('button');
        expect(button).toBeInTheDocument();
        expect(button).toHaveClass('action-btn view-btn');
        expect(button).toHaveAttribute('title', 'View Details');
    });

    it('renders correct type and title', () => {
        render(<ActionButton type="edit" onClick={() => { }} />);
        const button = screen.getByRole('button');
        expect(button).toHaveClass('edit-btn');
        expect(button).toHaveAttribute('title', 'Edit');
    });

    it('handles click events', () => {
        const handleClick = vi.fn();
        render(<ActionButton onClick={handleClick} />);

        const button = screen.getByRole('button');
        fireEvent.click(button);

        expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('respects disabled state', () => {
        const handleClick = vi.fn();
        render(<ActionButton disabled onClick={handleClick} />);

        const button = screen.getByRole('button');
        expect(button).toBeDisabled();

        fireEvent.click(button);
        expect(handleClick).not.toHaveBeenCalled();
    });

    it('shows loading state', () => {
        render(<ActionButton loading onClick={() => { }} />);
        const button = screen.getByRole('button');
        expect(button).toHaveClass('loading');
        expect(button).toBeDisabled();
    });

    it('renders children if provided', () => {
        render(<ActionButton onClick={() => { }}><span>Custom Content</span></ActionButton>);
        expect(screen.getByText('Custom Content')).toBeInTheDocument();
    });
});
