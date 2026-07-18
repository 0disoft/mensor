export function createRsvpStore() {
  const responses = [];
  let nextId = 1;

  return {
    create(input) {
      const response = { id: nextId, ...input };
      nextId += 1;
      responses.push(response);
      return response;
    },
    list() {
      return responses.map((response) => ({ ...response }));
    },
  };
}
