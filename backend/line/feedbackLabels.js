const RATING_LABELS = {
  good: '滿意',
  ok: '普通',
  bad: '不滿意'
};

const DIM_LABELS = {
  overall: '整體',
  wait: '等候',
  food: '餐點',
  service: '服務'
};

function labelRating(rating) {
  if (!rating) return '—';
  return RATING_LABELS[rating] || rating;
}

function labelDim(dim) {
  return DIM_LABELS[dim] || dim;
}

module.exports = { RATING_LABELS, DIM_LABELS, labelRating, labelDim };
