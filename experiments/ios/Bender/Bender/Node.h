//
//  Node.h
//  Bender
//
//  Created by Julien Quint on 2/24/14.
//  Copyright (c) 2014 IGEL, Co., Ltd. All rights reserved.
//

#import <Foundation/Foundation.h>

@interface Node : NSObject

@property (weak, nonatomic) Node *parent;         // parent node (if any)
@property (strong, nonatomic) NSArray *children;  // node children
@property (strong, nonatomic) NSString *name;     // name, unique within scope

- (Node *)insertChild:(Node *)child;

@end
