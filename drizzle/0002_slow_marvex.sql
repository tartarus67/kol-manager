-- Drop old kols table (created in 0001, no data yet)
DROP TABLE IF EXISTS `kols`;

-- KOLs: one row per KOL identity with audience + engagement aggregate metrics
CREATE TABLE `kols` (
  `id` int AUTO_INCREMENT NOT NULL,
  `handle` varchar(128) NOT NULL,
  `displayName` varchar(256),
  `platform` varchar(64) NOT NULL DEFAULT 'X',
  `profileUrl` varchar(512),
  `followers` bigint,
  `smartFollowers` int,
  `engagementRate` decimal(8,4),
  `avgEngagement` decimal(12,2),
  `avgImpressions` decimal(14,2),
  `score` decimal(10,2),
  `tier` varchar(32),
  `region` varchar(64),
  `category` varchar(128),
  `contentType` varchar(128),
  `contentFormat` varchar(128),
  `tags` text,
  `costPerPost` decimal(10,2),
  `status` enum('active','inactive','pending') NOT NULL DEFAULT 'active',
  `source` varchar(128),
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `kols_id` PRIMARY KEY(`id`)
);

-- KOL Posts: one row per tracked post / campaign activation
CREATE TABLE `kol_posts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `kolId` int NOT NULL,
  `postUrl` varchar(512),
  `platform` varchar(64),
  `postDate` varchar(32),
  `postTitle` text,
  `topic` varchar(256),
  `postType` varchar(64),
  `campaignRegion` varchar(64),
  `campaignSubject` varchar(128),
  `views` int,
  `impressions` bigint,
  `likes` int,
  `comments` int,
  `reposts` int,
  `quotes` int,
  `bookmarks` int,
  `totalEngagement` int,
  `engagementRate` decimal(8,4),
  `result` varchar(64),
  `featuredReview` text,
  `costPerPost` decimal(10,2),
  `cpm` decimal(10,2),
  `walletAddress` varchar(256),
  `txId` varchar(512),
  `paid` varchar(32),
  `source` varchar(128),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `kol_posts_id` PRIMARY KEY(`id`)
);