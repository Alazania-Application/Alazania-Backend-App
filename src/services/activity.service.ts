import { NodeLabels, RelationshipTypes } from "@/enums";
import BaseService from "./base.service";
import { IReadQueryParams, valueToNativeType } from "@/utils";

class ActivityService extends BaseService {
  getActivities = async (params: { userId: string } & IReadQueryParams = { userId: "" } ) => {
    const query = `
          MATCH (u:${NodeLabels.User} {id: $userId})-[:${RelationshipTypes.HAS_ACTIVITY}]->(activity:${NodeLabels.Activity})
          OPTIONAL MATCH (actor:${NodeLabels.User} {id: activity.actorId})
          OPTIONAL MATCH (post:${NodeLabels.Post} {id: activity.targetId, isDeleted: false})
            //OPTIONAL MATCH (file:${NodeLabels.File})<-[r_has_file:${RelationshipTypes.HAS_FILE}]-(post)

          // Optional match to check if the user is following the actor
          OPTIONAL MATCH (u)-[r_follows:${RelationshipTypes.FOLLOWS}]->(actor)
          OPTIONAL MATCH (actor)-[r_follows_back:${RelationshipTypes.FOLLOWS}]->(u)

          WITH activity, actor, post, r_follows, r_follows_back, u // Project variables forward

          SKIP $skip
          LIMIT $limit

          RETURN activity{
              .*, // Return all existing properties of the activity node
              actor: {
                  userId: actor.id,
                  username: COALESCE(actor.username, actor.email),
                  avatar: COALESCE(actor.avatar, "")
              },
              postThumbnailUrl: CASE
                  WHEN activity.type IN ["LIKE", "COMMENT", "SHARE", "REPLY"] AND post IS NOT NULL THEN post.thumbnailUrl
                  ELSE NULL
              END,
              isFollowing: CASE
                  WHEN r_follows IS NOT NULL THEN TRUE
                  ELSE FALSE
              END,
              isFollowingBack: CASE
                  WHEN r_follows_back IS NOT NULL THEN TRUE
                  ELSE FALSE
              END,
              displayMessage: CASE activity.type
                  WHEN "FOLLOW" THEN actor.username + " started following you."
                  WHEN "LIKE" THEN
                      CASE
                          WHEN post IS NOT NULL THEN actor.username + " liked your post: '" + COALESCE(post.title, LEFT(post.content, 50) + "...") + "'"
                          ELSE actor.username + " liked something you did."
                      END
                  WHEN "COMMENT" THEN
                      CASE
                          WHEN post IS NOT NULL THEN actor.username + " commented on your post: '" + COALESCE(post.title, LEFT(post.content, 50) + "...") + "'"
                          ELSE actor.username + " commented on your post."
                      END
                  WHEN "SHARE" THEN
                      CASE
                          WHEN post IS NOT NULL THEN actor.username + " shared your post: '" + COALESCE(post.title, LEFT(post.content, 50) + "...") + "'"
                          ELSE actor.username + " shared your post."
                      END
                  WHEN "TAG" THEN
                      CASE
                          WHEN post IS NOT NULL THEN actor.username + " tagged you in a post: '" + COALESCE(post.title, LEFT(post.content, 50) + "...") + "'"
                          ELSE actor.username + " tagged you."
                      END
                  WHEN "MENTIONED" THEN
                      CASE
                          WHEN post IS NOT NULL THEN actor.username + " mentioned you in a post: '" + COALESCE(post.title, LEFT(post.content, 50) + "...") + "'"
                          ELSE actor.username + " mentioned you."
                      END
                  WHEN "REPLY" THEN
                      CASE
                          WHEN post IS NOT NULL THEN actor.username + " replied to your comment on post: '" + COALESCE(post.title, LEFT(post.content, 50) + "...") + "'"
                          ELSE actor.username + " replied to your comment."
                      END
                  ELSE "Unknown activity."
              END
          } AS activity

          ORDER BY activity.createdAt DESC
        `;

    const result = await this.readFromDB(query, params);

    return result.records.map((record) => {
      return valueToNativeType(record.get("activity"));
    });
  };
}

export const activityService = new ActivityService();
