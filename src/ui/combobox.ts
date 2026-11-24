const parts = (input: HTMLInputElement) => {
  const list = document.getElementById(input.getAttribute('aria-controls') ?? '')!;
  return { list, options: [...list.querySelectorAll<HTMLElement>('[role="option"]')], empty: list.nextElementSibling as HTMLElement };
};

export function openCombo(input: HTMLInputElement) {
  const { list, options, empty } = parts(input);
  const query = input.value.trim().toLowerCase();
  for (const option of options) option.hidden = !option.dataset.name!.includes(query);
  const visible = options.filter(option => !option.hidden);
  list.hidden = !visible.length;
  empty.hidden = !!visible.length;
  input.setAttribute('aria-expanded', String(!!visible.length));
  // Typing highlights the first match so Enter picks it, as in a search field.
  select(input, query ? visible[0] : undefined);
}

export function closeCombo(input: HTMLInputElement) {
  const { list, empty } = parts(input);
  list.hidden = true;
  empty.hidden = true;
  input.setAttribute('aria-expanded', 'false');
  select(input, undefined);
}

export function moveCombo(input: HTMLInputElement, step: number) {
  const visible = parts(input).options.filter(option => !option.hidden);
  const current = visible.findIndex(option => option.id === input.getAttribute('aria-activedescendant'));
  select(input, visible[(current + step + visible.length) % visible.length] ?? visible[0]);
}

export const activeOption = (input: HTMLInputElement) =>
  document.getElementById(input.getAttribute('aria-activedescendant') ?? '') ?? undefined;

function select(input: HTMLInputElement, option: HTMLElement | undefined) {
  for (const other of parts(input).options) other.setAttribute('aria-selected', String(other === option));
  if (option) {
    input.setAttribute('aria-activedescendant', option.id);
    option.scrollIntoView({ block: 'nearest' });
  } else input.removeAttribute('aria-activedescendant');
}
