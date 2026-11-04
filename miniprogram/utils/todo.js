function todoPatch(page, action, value) {
  const { items, remaining } = page.data;

  if (action === 'add') {
    const title = value.trim();
    if (!title) return null;
    return {
      [`items[${items.length}]`]: { id: ++page.nextTodoId, title, done: false },
      remaining: remaining + 1,
      draft: ''
    };
  }

  const index = items.findIndex((item) => item.id === value);
  if (index === -1) return null;

  const { done } = items[index];
  if (action === 'toggle') {
    return { [`items[${index}].done`]: !done, remaining: remaining + (done ? 1 : -1) };
  }

  const nextItems = items.slice();
  nextItems.splice(index, 1);
  return { items: nextItems, remaining: remaining - (done ? 0 : 1) };
}

module.exports = { todoPatch };
