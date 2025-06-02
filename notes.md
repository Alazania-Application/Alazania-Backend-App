## Graph Data Model

### Nodes
- **User**
- **Post**
- **Topic**
- **Hashtag**

### Relationships

- **User INTERESTED_IN Topic**  
  _A user is interested in a topic._
- **User INTERESTED_IN Hashtag**  
  _A user is interested in a hashtag._
- **Hashtag BELONGS_TO Topic**  
  _A hashtag is associated with a topic._
- **Post IN_TOPIC Topic**  
  _A post belongs to a topic._

---

#### Visual Example

```
(User)-[:INTERESTED_IN]->(Topic)
(User)-[:INTERESTED_IN]->(Hashtag)
(Hashtag)-[:BELONGS_TO]->(Topic)
(Post)-[:IN_TOPIC]->(Topic)
```

---

You can further expand each node with its key properties if needed, for example:

#### User Properties
- id
- username
- email
- ...

#### Post Properties
- id
- content
- createdAt
- ...