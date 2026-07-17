export function getSemanticRole(element: Element) {
  if (element instanceof HTMLElement || element instanceof SVGElement) {
    const explicitRole = element.getAttribute("role")?.trim();
    if (explicitRole && /^[a-zA-Z][\w-]*$/.test(explicitRole)) {
      return explicitRole.toLowerCase();
    }
  }

  const tagName = element.tagName.toLowerCase();

  if (tagName === "a" && element instanceof HTMLAnchorElement && element.hasAttribute("href")) {
    return "link";
  }

  if (tagName === "input" && element instanceof HTMLInputElement) {
    return getInputRole(element);
  }

  const nativeRoles: Record<string, string> = {
    aside: "complementary",
    button: "button",
    footer: "contentinfo",
    form: "form",
    header: "banner",
    img: "img",
    main: "main",
    nav: "navigation",
    select: "combobox",
    textarea: "textbox"
  };

  return nativeRoles[tagName];
}

function getInputRole(element: HTMLInputElement) {
  const type = element.type.toLowerCase();

  const inputRoles: Record<string, string> = {
    button: "button",
    checkbox: "checkbox",
    email: "textbox",
    file: "button",
    hidden: "none",
    number: "spinbutton",
    password: "textbox",
    radio: "radio",
    range: "slider",
    reset: "button",
    search: "searchbox",
    submit: "button",
    tel: "textbox",
    text: "textbox",
    url: "textbox"
  };

  return inputRoles[type] ?? "textbox";
}
