const { GraphQLServer, PubSub } = require("graphql-yoga");
const fetch = (url) => import('node-fetch').then(({ default: fetch }) => fetch(url));

const messages = [];

const typeDefs = `

  type Links {
    url: String!
    title: String!
  }

  type Message {
    id: ID!
    user: String!
    content: String!
    mentions: [String!]
    emoticons: [String!]
    links: [Links]!
  }

  type Query {
    messages: [Message!]
  }

  type Mutation {
    postMessage(user: String!, content: String!): ID!
  }

  type Subscription {
    messages: [Message!]
  }
`;

const subscribers = [];
const onMessagesUpdates = (fn) => subscribers.push(fn);

const resolvers = {
  Query: {
    messages: () => messages,
  },
  Mutation: {
    postMessage: (parent, { user, content }) => {
      const id = messages.length;
      content = ' ' + content;
      let mentions = content.match(/([\s+])@([^\s]+)/g);
      mentions = mentions?.map(function (x) { return x.replace(/([\s+])@([^\s]+)/g, "$2"); });

      let emoticons = content.match(/([\s+])\(([^()]{1,15})\)/g);

      emoticons = emoticons?.map(function (x) { return x.replace(/([\s+])\(([^()]*)\)/g, "$2") });

      const linksData = content.match(/(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig);
      let links = [];
      const getTitle = async (url) => {
        return await fetch(url)
          .then(res => res.text())
          .then(body => parseTitle(body))
          .then(title => {
            return title;
          })
      };

      const parseTitle = (body) => {
        let match = body.match(/<title>([^<]*)<\/title>/) // regular expression to parse contents of the <title> tag
        if (!match || typeof match[1] !== 'string')
          return 'Unable to parse the title tag'
        return match[1]
      }

      if (linksData) {
        linksData.map(it => {
          links.push({
            url: it,
            title: getTitle(it)
          })
        })
      }

      content = content.trim();
      messages.push({
        id,
        user,
        content,
        mentions,
        emoticons,
        links
      });
      subscribers.forEach((fn) => fn());
      return id;
    },
  },
  Subscription: {
    messages: {
      subscribe: (parent, args, { pubsub }) => {
        const channel = Math.random().toString(36).slice(2, 15);
        onMessagesUpdates(() => pubsub.publish(channel, { messages }));
        setTimeout(() => pubsub.publish(channel, { messages }), 0);
        return pubsub.asyncIterator(channel);
      },
    },
  },
};

const pubsub = new PubSub();
const server = new GraphQLServer({ typeDefs, resolvers, context: { pubsub } });
server.start(({ port }) => {
  console.log(`Server on http://localhost:${port}/`);
});
