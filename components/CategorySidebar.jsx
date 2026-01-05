import React from 'react';

const CategorySidebar = ({ categories, selectedCategory, onSelectCategory }) => {
  return (
    <aside className="w-36 bg-white flex-shrink-0 p-3 overflow-y-auto border-r border-slate-200 shadow-sm">
      <nav>
        <ul className="space-y-2">
          {categories.map((category) => (
            <li key={category.id}>
              <button
                onClick={() => onSelectCategory(category.id)}
                className={`w-full flex flex-col items-center justify-center p-3 rounded-xl text-center transition-all duration-300 ease-in-out transform hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-primary-400
                  ${
                    selectedCategory === category.id
                      ? 'bg-gradient-to-br from-primary-100 to-primary-200 text-primary-700 font-bold shadow-inner border-l-4 border-primary-500'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-600'
                  }`}
              >
                <div className="mb-1">{category.icon}</div>
                <span className="text-sm font-semibold font-heading">{category.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
};

export default CategorySidebar;

