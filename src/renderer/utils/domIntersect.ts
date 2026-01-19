export function isIntersecting(dom1: Element, dom2: Element) {
  const firstBBox = dom1.getBoundingClientRect();
  const secondBBox = dom2.getBoundingClientRect();

  // I used to be able to do these things mentally.... I had to google that

  // console.log(firstBBox, secondBBox);

  return firstBBox.left < secondBBox.right
    && firstBBox.right > secondBBox.left
    && firstBBox.top < secondBBox.bottom
    && firstBBox.bottom > secondBBox.top;
}
