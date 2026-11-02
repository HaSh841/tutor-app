// returns an error message, or '' when the codename is accepted
export function checkCodename(name) {
  if (!/^[A-Z]/.test(name)) {
    return 'Your codename must start with a capital letter.'
  }
  if (!/^[A-Z][A-Za-z]*-\d+$/.test(name)) {
    return 'After the name, add a dash and numbers, like Kal-017.'
  }
  return ''
}