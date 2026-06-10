// UID Generator (10-digit)
// Generates a random 10-digit number and ensures it is not a "premium" or "rare" pattern.

function isPremiumPattern(uid) {
  const str = String(uid);
  if (str.length !== 10) return true;

  // 1. All same digits (e.g., 1111111111)
  if (/^(\d)\1{9}$/.test(str)) return true;

  // 2. Sequential ascending or descending (e.g., 0123456789, 9876543210)
  if ('0123456789'.includes(str) || '9876543210'.includes(str)) return true;

  // 3. Repeating half patterns (e.g., 1234512345)
  const half1 = str.substring(0, 5);
  const half2 = str.substring(5, 10);
  if (half1 === half2) return true;

  // 4. Too many trailing zeros (e.g., 1230000000)
  if (/0{5,}$/.test(str)) return true;

  // 5. Palindromes (e.g., 1234554321)
  const reversed = str.split('').reverse().join('');
  if (str === reversed) return true;

  return false;
}

function generateUID() {
  let uid = '';
  let isPremium = true;

  while (isPremium) {
    // Generate 10 random digits. Make sure first digit is not 0.
    const firstDigit = Math.floor(Math.random() * 9) + 1;
    const remaining = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join('');
    uid = `${firstDigit}${remaining}`;
    
    isPremium = isPremiumPattern(uid);
  }

  return uid;
}

module.exports = { generateUID, isPremiumPattern };
